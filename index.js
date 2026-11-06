/**
 * YouTube Ambient Flow - Main Content Script
 * Extracts colors from video frames and applies ambient theming to YouTube.
 */

(function () {
  "use strict";

  if (window.AmbientFlow && window.AmbientFlow.initialized) return;

  // ============================================================
  // NAMESPACE
  // ============================================================
  const AF = {
    initialized: true,
    version: "1.0.0",
    state: {
      enabled: true,
      focusMode: false,
      frozen: false,
      mode: "cinematic", // cinematic | minimal | vibrant | relax
      performance: "balanced", // high | balanced | battery
      backgroundStyle: "gradient", // gradient | solid | transparent
      glowIntensity: 0.6,
      glowBlur: 80,
      smoothing: 0.85,
      currentPalette: null,
      lastPalette: null,
      samplingFailed: false,
      sceneDetection: true,
      readabilityBoost: true,
      channelThemes: {},
      colorHistory: [],
    },
    video: null,
    canvas: null,
    ctx: null,
    sampleInterval: null,
    observer: null,
    lastFrameTime: 0,
    sceneChangeThreshold: 0.35,
  };

  window.AmbientFlow = AF;

  // ============================================================
  // CONFIGURATION PER MODE / PERFORMANCE
  // ============================================================
  const PERFORMANCE_CONFIG = {
    high: { sampleMs: 400, sampleSize: 64, smoothFactor: 0.7 },
    balanced: { sampleMs: 900, sampleSize: 48, smoothFactor: 0.85 },
    battery: { sampleMs: 2000, sampleSize: 32, smoothFactor: 0.95 },
  };

  const MODE_CONFIG = {
    cinematic: {
      saturation: 1.0,
      lightness: 1.0,
      transition: "1.2s",
      glow: 1.0,
    },
    minimal: { saturation: 0.6, lightness: 0.9, transition: "1.8s", glow: 0.3 },
    vibrant: {
      saturation: 1.5,
      lightness: 1.05,
      transition: "0.8s",
      glow: 1.3,
    },
    relax: { saturation: 0.8, lightness: 0.85, transition: "2.5s", glow: 0.6 },
  };

  const DEFAULT_PALETTE = {
    dominant: { r: 20, g: 20, b: 30 },
    accent: { r: 120, g: 80, b: 200 },
    average: { r: 30, g: 30, b: 40 },
    dark: { r: 10, g: 10, b: 15 },
    light: { r: 240, g: 240, b: 245 },
  };

  // ============================================================
  // COLOR UTILITIES
  // ============================================================
  const ColorUtils = {
    rgbToHex({ r, g, b }) {
      return (
        "#" +
        [r, g, b]
          .map((v) =>
            Math.round(Math.max(0, Math.min(255, v)))
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    },

    rgbToHsl({ r, g, b }) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      let h,
        s,
        l = (max + min) / 2;
      if (max === min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }
        h /= 6;
      }
      return { h: h * 360, s: s * 100, l: l * 100 };
    },

    hslToRgb({ h, s, l }) {
      h = (((h % 360) + 360) % 360) / 360;
      s /= 100;
      l /= 100;
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return { r: r * 255, g: g * 255, b: b * 255 };
    },

    adjust({ r, g, b }, { saturation = 1, lightness = 1 }) {
      const hsl = ColorUtils.rgbToHsl({ r, g, b });
      hsl.s = Math.max(0, Math.min(100, hsl.s * saturation));
      hsl.l = Math.max(0, Math.min(100, hsl.l * lightness));
      return ColorUtils.hslToRgb(hsl);
    },

    luminance({ r, g, b }) {
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },

    contrastRatio(c1, c2) {
      const l1 = ColorUtils.luminance(c1) + 0.05;
      const l2 = ColorUtils.luminance(c2) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    },

    distance(c1, c2) {
      return (
        Math.sqrt(
          Math.pow(c1.r - c2.r, 2) +
            Math.pow(c1.g - c2.g, 2) +
            Math.pow(c1.b - c2.b, 2),
        ) / 441.67
      );
    },

    lerp(c1, c2, t) {
      return {
        r: c1.r + (c2.r - c1.r) * t,
        g: c1.g + (c2.g - c1.g) * t,
        b: c1.b + (c2.b - c1.b) * t,
      };
    },

    rgba({ r, g, b }, a = 1) {
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
    },

    readableText(bg) {
      return ColorUtils.luminance(bg) > 140
        ? { r: 20, g: 20, b: 25 }
        : { r: 245, g: 245, b: 250 };
    },
  };

  // ============================================================
  // COLOR EXTRACTION (Canvas-based)
  // ============================================================
  const ColorExtractor = {
    sampleSize: 48,

    extract(video) {
      try {
        if (!AF.canvas) {
          AF.canvas = document.createElement("canvas");
          AF.ctx = AF.canvas.getContext("2d", { willReadFrequently: true });
        }

        const size = ColorExtractor.sampleSize;
        AF.canvas.width = size;
        AF.canvas.height = size;

        if (!video.videoWidth || !video.videoHeight) return null;

        AF.ctx.drawImage(video, 0, 0, size, size);
        const data = AF.ctx.getImageData(0, 0, size, size).data;

        return ColorExtractor.analyze(data);
      } catch (err) {
        // Cross-origin media protection
        if (!AF.state.samplingFailed) {
          AF.state.samplingFailed = true;
          console.warn(
            "[AmbientFlow] Frame sampling failed (CORS):",
            err.message,
          );
          AF.notify(
            "Frame analysis unavailable due to browser security restrictions. Using last theme.",
          );
        }
        return null;
      }
    },

    analyze(data) {
      const buckets = {};
      const samples = [];
      let totalR = 0,
        totalG = 0,
        totalB = 0,
        count = 0;

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2],
          a = data[i + 3];
        if (a < 128) continue;

        totalR += r;
        totalG += g;
        totalB += b;
        count++;

        // Quantize into buckets for dominant detection
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0 };
        const bk = buckets[key];
        bk.r += r;
        bk.g += g;
        bk.b += b;
        bk.n++;

        samples.push({ r, g, b });
      }

      if (count === 0) return null;

      // Dominant color (largest bucket)
      let dominant = { r: 0, g: 0, b: 0 };
      let maxN = 0;
      for (const key in buckets) {
        if (buckets[key].n > maxN) {
          maxN = buckets[key].n;
          const bk = buckets[key];
          dominant = { r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n };
        }
      }

      const average = {
        r: totalR / count,
        g: totalG / count,
        b: totalB / count,
      };

      // Accent = most saturated sample among top buckets
      let accent = dominant;
      let bestSat = -1;
      for (const key in buckets) {
        const bk = buckets[key];
        if (bk.n < maxN * 0.15) continue;
        const c = { r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n };
        const hsl = ColorUtils.rgbToHsl(c);
        if (hsl.s > bestSat) {
          bestSat = hsl.s;
          accent = c;
        }
      }

      return { dominant, average, accent };
    },
  };

  // ============================================================
  // PALETTE ENGINE
  // ============================================================
  const PaletteEngine = {
    build(raw, mode) {
      const cfg = MODE_CONFIG[mode] || MODE_CONFIG.cinematic;

      const dominant = ColorUtils.adjust(raw.dominant, {
        saturation: cfg.saturation,
        lightness: 0.5,
      });
      const accent = ColorUtils.adjust(raw.accent, {
        saturation: cfg.saturation * 1.2,
        lightness: 0.6,
      });
      const average = ColorUtils.adjust(raw.average, {
        saturation: cfg.saturation,
        lightness: 0.5,
      });

      // Dark variant for backgrounds
      const darkHsl = ColorUtils.rgbToHsl(dominant);
      darkHsl.l = Math.min(darkHsl.l, 18);
      darkHsl.s = Math.min(darkHsl.s, 45);
      const dark = ColorUtils.hslToRgb(darkHsl);

      // Light variant for text
      const lightHsl = ColorUtils.rgbToHsl(accent);
      lightHsl.l = Math.max(lightHsl.l, 75);
      const light = ColorUtils.hslToRgb(lightHsl);

      const text = ColorUtils.readableText(dark);

      return {
        dominant,
        accent,
        average,
        dark,
        light,
        text,
        dominantHex: ColorUtils.rgbToHex(dominant),
        accentHex: ColorUtils.rgbToHex(accent),
        darkHex: ColorUtils.rgbToHex(dark),
        lightHex: ColorUtils.rgbToHex(light),
      };
    },

    smooth(prev, next, factor) {
      if (!prev) return next;
      const f = 1 - factor;
      return {
        dominant: ColorUtils.lerp(prev.dominant, next.dominant, f),
        accent: ColorUtils.lerp(prev.accent, next.accent, f),
        average: ColorUtils.lerp(prev.average, next.average, f),
        dark: ColorUtils.lerp(prev.dark, next.dark, f),
        light: ColorUtils.lerp(prev.light, next.light, f),
        text: next.text,
        dominantHex: ColorUtils.rgbToHex(
          ColorUtils.lerp(prev.dominant, next.dominant, f),
        ),
        accentHex: ColorUtils.rgbToHex(
          ColorUtils.lerp(prev.accent, next.accent, f),
        ),
        darkHex: ColorUtils.rgbToHex(ColorUtils.lerp(prev.dark, next.dark, f)),
        lightHex: ColorUtils.rgbToHex(
          ColorUtils.lerp(prev.light, next.light, f),
        ),
      };
    },
  };

  // ============================================================
  // SCENE DETECTION
  // ============================================================
  const SceneDetector = {
    lastSignature: null,

    changed(palette) {
      if (!AF.state.sceneDetection || !this.lastSignature) {
        this.lastSignature = palette.dominant;
        return true;
      }
      const dist = ColorUtils.distance(this.lastSignature, palette.dominant);
      this.lastSignature = palette.dominant;
      return dist > AF.sceneChangeThreshold;
    },
  };

  // ============================================================
  // THEME ENGINE
  // ============================================================
  const ThemeEngine = {
    styleEl: null,

    ensureStyle() {
      if (!this.styleEl) {
        this.styleEl = document.createElement("style");
        this.styleEl.id = "ambient-flow-styles";
        document.documentElement.appendChild(this.styleEl);
      }
      return this.styleEl;
    },

    apply(palette) {
      if (!palette || !AF.state.enabled) return;

      const cfg = MODE_CONFIG[AF.state.mode] || MODE_CONFIG.cinematic;
      const transition = cfg.transition;
      const style = AF.state.backgroundStyle;
      const glow = AF.state.glowIntensity * cfg.glow;
      const blur = AF.state.glowBlur;

      const { dominant, accent, dark, light, text } = palette;
      const bodyBg =
        style === "transparent"
          ? "transparent"
          : style === "solid"
            ? ColorUtils.rgba(dark, 0.95)
            : `linear-gradient(135deg, ${ColorUtils.rgba(dark, 0.96)} 0%, ${ColorUtils.rgba(dominant, 0.9)} 100%)`;

      const textColor = ColorUtils.rgba(text, 0.95);
      const mutedText = ColorUtils.rgba(text, 0.65);

      const css = `
        :root {
          --af-dominant: ${palette.dominantHex};
          --af-accent: ${palette.accentHex};
          --af-dark: ${palette.darkHex};
          --af-light: ${palette.lightHex};
          --af-text: ${textColor};
          --af-transition: ${transition};
        }

        html, body {
          background: ${bodyBg} !important;
          transition: background ${transition} ease !important;
        }

        #page-manager, ytd-app, #content, #primary, #secondary,
        ytd-watch-flexy, #columns, #related, ytd-watch-next-secondary-results-renderer {
          background: transparent !important;
        }

        ytd-watch-flexy[theater] #player-theater-container,
        #movie_player {
          box-shadow: 0 0 ${blur}px ${glow * 40}px ${ColorUtils.rgba(dominant, glow * 0.45)},
                      0 0 ${blur * 2}px ${ColorUtils.rgba(accent, glow * 0.25)} !important;
          transition: box-shadow ${transition} ease !important;
        }

        ytd-comment-thread-renderer,
        ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer,
        ytd-rich-item-renderer,
        ytd-video-renderer,
        #secondary .ytd-item-section-renderer {
          background: ${ColorUtils.rgba(dark, 0.55)} !important;
          border-radius: 12px !important;
          transition: background ${transition} ease !important;
        }

        ytd-compact-video-renderer:hover,
        ytd-video-renderer:hover {
          background: ${ColorUtils.rgba(dominant, 0.35)} !important;
        }

        #masthead-container,
        ytd-masthead {
          background: ${ColorUtils.rgba(dark, 0.85)} !important;
          backdrop-filter: blur(12px);
          transition: background ${transition} ease !important;
        }

        yt-formatted-string, #title, .title, h1, h2, h3,
        ytd-video-primary-info-renderer, ytd-video-secondary-info-renderer {
          color: ${textColor} !important;
          transition: color ${transition} ease !important;
        }

        #description, .description, ytd-metadata-row-renderer,
        #metadata-line, .metadata-line, ytd-video-meta-block {
          color: ${mutedText} !important;
        }

        ytd-thumbnail, #thumbnail {
          border-radius: 10px !important;
          overflow: hidden;
        }

        ${
          AF.state.focusMode
            ? `
          #secondary, #related, ytd-watch-next-secondary-results-renderer,
          #comments, ytd-comments, ytd-comment-section-renderer {
            display: none !important;
          }
          ytd-watch-flexy #primary {
            max-width: 100% !important;
            margin: 0 auto !important;
          }
        `
            : ""
        }

        ${
          AF.state.frozen
            ? `
          * { transition: none !important; }
        `
            : ""
        }

        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
      `;

      this.ensureStyle().textContent = css;
    },

    clear() {
      if (this.styleEl) {
        this.styleEl.textContent = "";
      }
    },
  };

  // ============================================================
  // VIDEO DETECTOR
  // ============================================================
  const VideoDetector = {
    find() {
      const candidates = document.querySelectorAll("video");
      let best = null;
      let bestScore = -1;
      for (const v of candidates) {
        if (!v.videoWidth) continue;
        const area = v.videoWidth * v.videoHeight;
        const visible = v.offsetWidth * v.offsetHeight;
        const score = area * (visible > 0 ? 1 : 0.1);
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      return best;
    },
  };

  // ============================================================
  // MAIN SAMPLING LOOP
  // ============================================================
  const Sampler = {
    start() {
      this.stop();
      const cfg =
        PERFORMANCE_CONFIG[AF.state.performance] || PERFORMANCE_CONFIG.balanced;
      AF.sampleInterval = setInterval(() => this.tick(), cfg.sampleMs);
      this.tick();
    },

    stop() {
      if (AF.sampleInterval) {
        clearInterval(AF.sampleInterval);
        AF.sampleInterval = null;
      }
    },

    tick() {
      if (!AF.state.enabled) return;

      const video = VideoDetector.find();
      if (!video || video.paused || video.ended || video.readyState < 2) return;

      AF.video = video;
      const raw = ColorExtractor.extract(video);
      if (!raw) {
        // Use last palette if sampling failed
        if (AF.state.samplingFailed && AF.state.currentPalette) {
          ThemeEngine.apply(AF.state.currentPalette);
        }
        return;
      }

      const cfg =
        PERFORMANCE_CONFIG[AF.state.performance] || PERFORMANCE_CONFIG.balanced;
      const built = PaletteEngine.build(raw, AF.state.mode);

      // Scene detection gate (only smooth when not a scene change)
      const sceneChanged = SceneDetector.changed(built);

      let palette;
      if (sceneChanged) {
        palette = built;
      } else {
        palette = PaletteEngine.smooth(
          AF.state.currentPalette,
          built,
          cfg.smoothFactor,
        );
      }

      AF.state.lastPalette = AF.state.currentPalette;
      AF.state.currentPalette = palette;

      if (!AF.state.frozen) {
        ThemeEngine.apply(palette);
      }

      // Channel theme memory
      const channel = document.querySelector(
        "#owner #channel-name a, ytd-channel-name a",
      );
      if (channel) {
        const name = channel.textContent.trim();
        if (name) {
          AF.state.channelThemes[name] = palette.darkHex;
          chrome.storage.local.set({ channelThemes: AF.state.channelThemes });
        }
      }
    },
  };

  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  AF.notify = function (msg) {
    const toast = document.createElement("div");
    toast.className = "af-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("af-toast-visible"), 50);
    setTimeout(() => {
      toast.classList.remove("af-toast-visible");
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  };

  // ============================================================
  // STATE MANAGEMENT
  // ============================================================
  AF.setState = function (patch) {
    Object.assign(AF.state, patch);
    chrome.storage.local.set({ ambientFlowState: AF.state });

    if (patch.enabled === false) {
      ThemeEngine.clear();
      Sampler.stop();
    } else if (patch.enabled === true) {
      Sampler.start();
      if (AF.state.currentPalette) ThemeEngine.apply(AF.state.currentPalette);
    }

    if (AF.state.currentPalette && AF.state.enabled) {
      ThemeEngine.apply(AF.state.currentPalette);
    }
  };

  AF.toggle = function () {
    AF.setState({ enabled: !AF.state.enabled });
    AF.notify(
      AF.state.enabled ? "Ambient Flow enabled" : "Ambient Flow disabled",
    );
  };

  AF.toggleFocus = function () {
    AF.setState({ focusMode: !AF.state.focusMode });
    AF.notify(AF.state.focusMode ? "Focus Mode ON" : "Focus Mode OFF");
  };

  AF.toggleFreeze = function () {
    AF.setState({ frozen: !AF.state.frozen });
    AF.notify(AF.state.frozen ? "Background frozen" : "Background unfrozen");
  };

  // ============================================================
  // STORAGE LOAD
  // ============================================================
  chrome.storage.local.get(["ambientFlowState", "channelThemes"], (result) => {
    if (result.ambientFlowState) {
      Object.assign(AF.state, result.ambientFlowState);
    }
    if (result.channelThemes) {
      AF.state.channelThemes = result.channelThemes;
    }
    boot();
  });

  // ============================================================
  // MESSAGE HANDLER (from popup / background)
  // ============================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case "toggle":
        AF.toggle();
        sendResponse({ state: AF.state });
        break;
      case "toggleFocus":
        AF.toggleFocus();
        sendResponse({ state: AF.state });
        break;
      case "toggleFreeze":
        AF.toggleFreeze();
        sendResponse({ state: AF.state });
        break;
      case "setState":
        AF.setState(msg.patch);
        sendResponse({ state: AF.state });
        break;
      case "getState":
        sendResponse({ state: AF.state });
        break;
      case "reset":
        AF.setState({ enabled: true, focusMode: false, frozen: false });
        AF.notify("Ambient Flow reset");
        sendResponse({ state: AF.state });
        break;
    }
    return true;
  });

  // ============================================================
  // BOOT + NAVIGATION OBSERVER
  // ============================================================
  function boot() {
    if (!AF.state.enabled) return;
    Sampler.start();

    // Re-detect on YouTube SPA navigation
    AF.observer = new MutationObserver(() => {
      if (AF.state.enabled && !AF.sampleInterval) {
        Sampler.start();
      }
    });

    AF.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Rebuild theme on fullscreen toggle
    document.addEventListener("fullscreenchange", () => {
      if (AF.state.currentPalette && AF.state.enabled) {
        setTimeout(() => ThemeEngine.apply(AF.state.currentPalette), 200);
      }
    });

    console.log("[AmbientFlow] Initialized v" + AF.version);
  }

  // ============================================================
  // KEYBOARD SHORTCUTS (fallback when commands API unavailable)
  // ============================================================
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey) {
      if (e.key === "A" || e.key === "a") {
        e.preventDefault();
        AF.toggle();
      }
      if (e.key === "F" || e.key === "f") {
        e.preventDefault();
        AF.toggleFocus();
      }
      if (e.key === "C" || e.key === "c") {
        e.preventDefault();
        AF.toggleFreeze();
      }
    }
  });
})();
