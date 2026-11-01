/* ==========================================
   YOUTUBE AMBIENT FLOW
   Video Color Extractor
========================================== */

(() => {
  "use strict";

  function getAmbientFlow() {
    const root = typeof window !== "undefined" ? window : globalThis;

    root.AmbientFlow = root.AmbientFlow || {};

    return root.AmbientFlow;
  }

  class ColorExtractor {
    constructor(options = {}) {
      const AF = getAmbientFlow();

      this.enabled = true;

      this.sampler = AF.frameSampler || null;
      this.sceneDetector = AF.sceneDetector || null;

      if (!this.sampler && typeof document !== "undefined") {
        this.sampler = {
          setVideo(video) {
            this.video = video || null;
            return true;
          },
          capture(video) {
            if (!video || !video.videoWidth || !video.videoHeight) {
              return { success: false, error: "INVALID_VIDEO" };
            }

            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d");

            if (!context) {
              return { success: false, error: "CANVAS_UNAVAILABLE" };
            }

            try {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);

              return {
                success: true,
                imageData: context.getImageData(0, 0, canvas.width, canvas.height),
                width: canvas.width,
                height: canvas.height,
                timestamp: performance.now(),
                video,
              };
            } catch (error) {
              return {
                success: false,
                error: error?.name === "SecurityError" ? "CANVAS_BLOCKED" : "FRAME_CAPTURE_FAILED",
                message: error?.message || "Frame capture failed.",
                cause: error,
              };
            }
          },
        };
      }

      this.sampleSize = options.sampleSize || 96;
      this.sceneThreshold = Number.isFinite(Number(options.sceneThreshold))
        ? Number(options.sceneThreshold)
        : 18;

      this.colorHistory = [];
      this.historyLimit = 4;

      this.lastColor = null;
      this.lastAnalysis = null;

      this.minimumColorDifference = options.minimumColorDifference || 10;

      this.captureCount = 0;
      this.failureCount = 0;

      this.destroyed = false;
    }

    /* ======================================
       ENABLE / DISABLE
    ====================================== */

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);

      if (!this.enabled) {
        this.reset();
      }
    }

    setSceneThreshold(threshold) {
      const next = Number(threshold);

      if (!Number.isFinite(next) || next < 1 || next > 100) {
        return false;
      }

      this.sceneThreshold = next;
      this.sceneDetector?.setThreshold?.(next);

      return this.sceneThreshold;
    }

    /* ======================================
       COLOR UTILITIES
    ====================================== */

    rgbToHex(r, g, b) {
      let red = r;
      let green = g;
      let blue = b;

      if (r && typeof r === "object") {
        red = r.r;
        green = r.g;
        blue = r.b;
      }

      const toHex = (value) =>
        Math.max(0, Math.min(255, Number.isFinite(Number(value)) ? Number(value) : 0))
          .toString(16)
          .padStart(2, "0");

      return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
    }

    hexToRgb(hex) {
      if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        return null;
      }

      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      };
    }

    getColorDifference(first, second) {
      const a = this.hexToRgb(first);
      const b = this.hexToRgb(second);

      if (!a || !b) return Infinity;

      return (
        (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 3
      );
    }

    /* ======================================
       DOMINANT COLOR EXTRACTION
    ====================================== */

    extractDominantColor(imageData) {
      if (!imageData?.data?.length) {
        return null;
      }

      const pixels = imageData.data;

      const buckets = new Map();

      // Ignore some pixels to reduce processing cost.
      const pixelStep = 16;

      for (let index = 0; index < pixels.length; index += pixelStep) {
        const alpha = pixels[index + 3];

        if (alpha < 128) continue;

        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];

        const brightness = (r + g + b) / 3;

        // Ignore extremely dark and nearly white pixels.
        if (brightness < 12 || brightness > 248) {
          continue;
        }

        // Quantize colors into buckets.
        const qr = Math.round(r / 32);
        const qg = Math.round(g / 32);
        const qb = Math.round(b / 32);

        const key = `${qr},${qg},${qb}`;

        if (!buckets.has(key)) {
          buckets.set(key, {
            r: 0,
            g: 0,
            b: 0,
            count: 0,
            saturation: 0,
          });
        }

        const bucket = buckets.get(key);

        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count++;

        const maximum = Math.max(r, g, b);
        const minimum = Math.min(r, g, b);

        bucket.saturation += maximum === 0 ? 0 : (maximum - minimum) / maximum;
      }

      if (!buckets.size) {
        return this.extractAverageColor(imageData);
      }

      const ranked = Array.from(buckets.values())
        .map((bucket) => {
          const count = bucket.count;

          return {
            r: bucket.r / count,
            g: bucket.g / count,
            b: bucket.b / count,
            count,
            saturation: bucket.saturation / count,
          };
        })
        .sort((a, b) => {
          // Prefer common, visually interesting colors.
          const scoreA = a.count * (1 + a.saturation * 0.15);

          const scoreB = b.count * (1 + b.saturation * 0.15);

          return scoreB - scoreA;
        });

      const dominant = ranked[0];

      return this.rgbToHex(dominant.r, dominant.g, dominant.b);
    }

    extractAverageColor(imageData) {
      const pixels = imageData.data;

      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i + 3] < 128) continue;

        red += pixels[i];
        green += pixels[i + 1];
        blue += pixels[i + 2];

        count++;
      }

      if (!count) return "#243b55";

      return this.rgbToHex(red / count, green / count, blue / count);
    }

    /* ======================================
       COLOR SMOOTHING
    ====================================== */

    smoothColor(color) {
      if (!color) return this.lastColor;

      this.colorHistory.push(color);

      if (this.colorHistory.length > this.historyLimit) {
        this.colorHistory.shift();
      }

      const colors = this.colorHistory
        .map((item) => this.hexToRgb(item))
        .filter(Boolean);

      if (!colors.length) return color;

      const average = colors.reduce(
        (result, current) => {
          result.r += current.r;
          result.g += current.g;
          result.b += current.b;

          return result;
        },
        { r: 0, g: 0, b: 0 },
      );

      const count = colors.length;

      const smoothed = this.rgbToHex(
        average.r / count,
        average.g / count,
        average.b / count,
      );

      if (
        this.lastColor &&
        this.getColorDifference(this.lastColor, smoothed) <
          this.minimumColorDifference
      ) {
        return this.lastColor;
      }

      this.lastColor = smoothed;

      return smoothed;
    }

    /* ======================================
       FRAME ANALYSIS
    ====================================== */

    analyze(video, options = {}) {
      if (this.destroyed || !this.enabled) {
        return {
          success: false,
          error: "EXTRACTOR_DISABLED",
        };
      }

      if (!video || !video.isConnected) {
        return false;
      }

      if (!video.videoWidth || !video.videoHeight) {
        return false;
      }

      if (typeof video.readyState === "number" && video.readyState === 0) {
        return false;
      }

      if (!this.sampler) {
        const AF = getAmbientFlow();
        this.sampler = AF.frameSampler || null;
      }

      if (!this.sceneDetector) {
        const AF = getAmbientFlow();
        this.sceneDetector = AF.sceneDetector || null;
      }

      if (!this.sampler) {
        return {
          success: false,
          error: "SAMPLER_UNAVAILABLE",
        };
      }

      try {
        this.sampler.setVideo?.(video);

        const frame = this.sampler.capture(video);

        if (!frame.success) {
          this.failureCount++;

          return {
            success: false,
            error: frame.error,
            message: frame.message || null,
          };
        }

        const imageData = frame.imageData;

        if (!imageData) {
          this.failureCount++;

          return {
            success: false,
            error: "EMPTY_IMAGE_DATA",
          };
        }

        let scene = null;

        if (this.sceneDetector) {
          scene = this.sceneDetector.analyze(imageData);
        }

        const rawColor = this.extractDominantColor(imageData);

        if (!rawColor) {
          this.failureCount++;

          return {
            success: false,
            error: "COLOR_EXTRACTION_FAILED",
          };
        }

        const color = this.smoothColor(rawColor);

        this.captureCount++;

        const result = {
          success: true,
          color,
          hex: color,
          dominantColor: color,
          rawColor,
          sceneChanged: Boolean(
            scene?.changed || scene?.sceneChanged || scene?.isSceneChange,
          ),
          scene,
          timestamp: frame.timestamp,
          width: frame.width,
          height: frame.height,
        };

        this.lastAnalysis = result;

        return result;
      } catch (error) {
        this.failureCount++;

        console.error("[Ambient Flow] Color analysis failed:", error);

        return {
          success: false,
          error: "ANALYSIS_FAILED",
          message: error?.message || "Unknown error.",
        };
      }
    }

    /* ======================================
       STATE
    ====================================== */

    getLastColor() {
      return this.lastColor;
    }

    getLastAnalysis() {
      return this.lastAnalysis;
    }

    getStats() {
      return {
        enabled: this.enabled,
        captures: this.captureCount,
        failures: this.failureCount,
        lastColor: this.lastColor,
        historySize: this.colorHistory.length,
      };
    }

    /* ======================================
       RESET
    ====================================== */

    reset() {
      this.colorHistory = [];
      this.lastColor = null;
      this.lastAnalysis = null;

      this.sampler?.clear?.();
      this.sceneDetector?.reset?.();
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.reset();

      this.destroyed = true;

      this.sampler = null;
      this.sceneDetector = null;
    }
  }

  const AF = getAmbientFlow();

  AF.ColorExtractor = ColorExtractor;
  AF.colorExtractor = new ColorExtractor();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ColorExtractor };
  }
})();
