/* ==========================================
   YOUTUBE AMBIENT FLOW
   Video Frame Sampler
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class FrameSampler {
    constructor(options = {}) {
      this.canvas = null;
      this.context = null;

      this.video = null;

      this.width = options.width || 96;
      this.height = options.height || 54;

      this.maxWidth = options.maxWidth || 160;
      this.maxHeight = options.maxHeight || 90;

      this.lastCaptureTime = 0;

      this.captureCount = 0;
      this.failureCount = 0;

      this.destroyed = false;

      this.createCanvas();
    }

    /* ======================================
       CANVAS INITIALIZATION
    ====================================== */

    createCanvas() {
      if (this.destroyed) return false;

      try {
        this.canvas = document.createElement("canvas");

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.context = this.canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        });

        if (!this.context) {
          throw new Error("Canvas 2D context is unavailable.");
        }

        return true;
      } catch (error) {
        this.failureCount++;

        console.error("[Ambient Flow] Canvas initialization failed:", error);

        this.canvas = null;
        this.context = null;

        return false;
      }
    }

    /* ======================================
       VIDEO VALIDATION
    ====================================== */

    validateVideo(video) {
      if (!video || !(video instanceof HTMLVideoElement)) {
        return {
          success: false,
          error: "INVALID_VIDEO",
        };
      }

      if (!video.isConnected) {
        return {
          success: false,
          error: "VIDEO_DISCONNECTED",
        };
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return {
          success: false,
          error: "VIDEO_NOT_READY",
        };
      }

      if (!video.videoWidth || !video.videoHeight) {
        return {
          success: false,
          error: "INVALID_VIDEO_DIMENSIONS",
        };
      }

      return {
        success: true,
      };
    }

    /* ======================================
       DIMENSION CALCULATION
    ====================================== */

    calculateDimensions(video) {
      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;

      const ratio = Math.min(
        this.maxWidth / originalWidth,
        this.maxHeight / originalHeight,
        1,
      );

      return {
        width: Math.max(1, Math.round(originalWidth * ratio)),

        height: Math.max(1, Math.round(originalHeight * ratio)),
      };
    }

    resizeCanvas(width, height) {
      if (!this.canvas || !this.context) {
        if (!this.createCanvas()) {
          return false;
        }
      }

      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;

        // Changing canvas dimensions resets its context state.
        this.context = this.canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        });
      }

      return Boolean(this.context);
    }

    /* ======================================
       CAPTURE FRAME
    ====================================== */

    capture(video = this.video) {
      if (this.destroyed) {
        return {
          success: false,
          error: "SAMPLER_DESTROYED",
        };
      }

      const validation = this.validateVideo(video);

      if (!validation.success) {
        return validation;
      }

      try {
        const dimensions = this.calculateDimensions(video);

        if (!this.resizeCanvas(dimensions.width, dimensions.height)) {
          throw new Error("Canvas context unavailable.");
        }

        this.video = video;

        this.context.drawImage(
          video,
          0,
          0,
          dimensions.width,
          dimensions.height,
        );

        const imageData = this.context.getImageData(
          0,
          0,
          dimensions.width,
          dimensions.height,
        );

        this.lastCaptureTime = performance.now();
        this.captureCount++;

        return {
          success: true,
          imageData,
          width: dimensions.width,
          height: dimensions.height,
          timestamp: this.lastCaptureTime,
          video,
        };
      } catch (error) {
        this.failureCount++;

        const blocked =
          error?.name === "SecurityError" ||
          /taint|cross-origin|origin-clean/i.test(error?.message || "");

        return {
          success: false,
          error: blocked ? "CANVAS_BLOCKED" : "FRAME_CAPTURE_FAILED",
          message: error?.message || "Frame capture failed.",
          cause: error,
        };
      }
    }

    /* ======================================
       COMPATIBILITY HELPERS
    ====================================== */

    sample(video = this.video) {
      return this.capture(video);
    }

    captureFrame(video = this.video) {
      return this.capture(video);
    }

    setVideo(video) {
      this.video = video || null;
    }

    clear() {
      this.video = null;
      this.lastCaptureTime = 0;

      if (this.context && this.canvas) {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    /* ======================================
       STATISTICS
    ====================================== */

    getStats() {
      return {
        captures: this.captureCount,
        failures: this.failureCount,
        lastCaptureTime: this.lastCaptureTime,
        width: this.canvas?.width || 0,
        height: this.canvas?.height || 0,
        hasCanvas: Boolean(this.canvas),
        destroyed: this.destroyed,
      };
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.clear();

      this.destroyed = true;

      this.context = null;
      this.canvas = null;
      this.video = null;
    }
  }

  AF.FrameSampler = FrameSampler;
  AF.frameSampler = new FrameSampler();
})();
