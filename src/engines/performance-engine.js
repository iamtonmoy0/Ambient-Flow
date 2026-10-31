(() => {
  "use strict";

  const AF = window.AmbientFlow;

  class PerformanceEngine {
    constructor() {
      this.mode = "balanced";
      this.lastSampleTime = 0;
      this.frameCount = 0;
      this.lastFPSCheck = Date.now();
      this.fps = 0;
      this.hidden = document.hidden;
      this.enabled = true;

      this.config = AF.PERFORMANCE.balanced;

      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }

    // Configure performance mode
    setMode(mode) {
      if (!AF.PERFORMANCE[mode]) {
        mode = "balanced";
      }

      this.mode = mode;
      this.config = AF.PERFORMANCE[mode];

      return this.config;
    }

    // Return current sampling configuration
    getConfig() {
      return { ...this.config };
    }

    // Check whether another sample is allowed
    canSample(video) {
      if (!this.enabled || this.hidden) {
        return false;
      }

      if (!video || video.paused || video.ended) {
        return false;
      }

      if (video.readyState < 2) {
        return false;
      }

      const now = Date.now();

      if (now - this.lastSampleTime < this.config.sampleInterval) {
        return false;
      }

      this.lastSampleTime = now;

      return true;
    }

    // Track processing frame rate
    trackFrame() {
      this.frameCount++;

      const now = Date.now();
      const elapsed = now - this.lastFPSCheck;

      if (elapsed >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / elapsed);

        this.frameCount = 0;
        this.lastFPSCheck = now;
      }

      return this.fps;
    }

    // Automatically reduce workload if processing is slow
    adapt() {
      if (this.mode === "battery") {
        return this.config;
      }

      if (this.fps > 0 && this.fps < 5) {
        return this.setMode("battery");
      }

      if (this.mode === "high" && this.fps < 15) {
        return this.setMode("balanced");
      }

      return this.config;
    }

    // Enable or disable processing
    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
    }

    // Handle background tab behavior
    handleVisibilityChange() {
      this.hidden = document.hidden;
    }

    // Reset sampling timer
    reset() {
      this.lastSampleTime = 0;
      this.frameCount = 0;
      this.lastFPSCheck = Date.now();
      this.fps = 0;
    }

    // Return diagnostic information
    getStats() {
      return {
        mode: this.mode,
        fps: this.fps,
        enabled: this.enabled,
        hidden: this.hidden,
        sampleInterval: this.config.sampleInterval,
        sampleWidth: this.config.sampleWidth,
        sampleHeight: this.config.sampleHeight,
      };
    }

    // Clean up listeners
    destroy() {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );

      this.enabled = false;
    }
  }

  AF.PerformanceEngine = PerformanceEngine;

  AF.performanceEngine = new PerformanceEngine();
})();
