/* ==========================================
   YOUTUBE AMBIENT FLOW
   Scene Change Detector
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class SceneDetector {
    constructor(options = {}) {
      this.enabled = true;

      this.threshold = options.threshold ?? 18;
      this.cooldown = options.cooldown ?? 250;

      // Last accepted scene baseline.
      this.referenceFrame = null;

      // Most recent sampled frame.
      this.latestFrame = null;

      this.lastSceneChange = 0;

      this.sceneCount = 0;
      this.analysisCount = 0;

      this.lastAnalysis = null;

      this.destroyed = false;
    }

    /* ======================================
       PIXEL COMPARISON
    ====================================== */

    calculateDifference(first, second) {
      if (!first || !second) return 0;

      const a = first.data;
      const b = second.data;

      if (!a || !b || a.length !== b.length) {
        return 0;
      }

      let difference = 0;
      let count = 0;

      // Sample every 16th byte group.
      for (let i = 0; i < a.length; i += 64) {
        const rDiff = Math.abs(a[i] - b[i]);
        const gDiff = Math.abs(a[i + 1] - b[i + 1]);
        const bDiff = Math.abs(a[i + 2] - b[i + 2]);

        difference += (rDiff + gDiff + bDiff) / 3;

        count++;
      }

      if (!count) return 0;

      return difference / count;
    }

    cloneFrame(imageData) {
      return {
        data: new Uint8ClampedArray(imageData.data),
        width: imageData.width,
        height: imageData.height,
      };
    }

    /* ======================================
       SCENE ANALYSIS
    ====================================== */

    analyze(imageData) {
      if (this.destroyed || !this.enabled || !imageData?.data) {
        return {
          changed: false,
          sceneChanged: false,
          difference: 0,
          reason: "DISABLED",
        };
      }

      this.analysisCount++;

      const currentFrame = this.cloneFrame(imageData);

      this.latestFrame = currentFrame;

      if (!this.referenceFrame) {
        this.referenceFrame = this.cloneFrame(currentFrame);

        const initialResult = {
          changed: true,
          sceneChanged: true,
          difference: 100,
          reason: "INITIAL_FRAME",
          sceneNumber: this.sceneCount + 1,
          timestamp: performance.now(),
        };

        this.sceneCount++;
        this.lastSceneChange = initialResult.timestamp;
        this.lastAnalysis = initialResult;

        return initialResult;
      }

      const difference = this.calculateDifference(
        this.referenceFrame,
        currentFrame,
      );

      const now = performance.now();

      const cooldownPassed = now - this.lastSceneChange >= this.cooldown;

      const changed = difference >= this.threshold && cooldownPassed;

      if (changed) {
        // Advance the reference only when a scene change
        // is actually accepted.
        this.referenceFrame = this.cloneFrame(currentFrame);

        this.lastSceneChange = now;
        this.sceneCount++;
      }

      const result = {
        changed,
        sceneChanged: changed,
        difference: Number(difference.toFixed(2)),
        reason: changed
          ? "SCENE_CHANGE"
          : difference >= this.threshold
            ? "COOLDOWN"
            : "STABLE",
        sceneNumber: this.sceneCount,
        timestamp: now,
      };

      this.lastAnalysis = result;

      return result;
    }

    /* ======================================
       CONFIGURATION
    ====================================== */

    setThreshold(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return;

      this.threshold = Math.max(1, Math.min(100, number));
    }

    setCooldown(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return;

      this.cooldown = Math.max(0, Math.min(5000, number));
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);

      if (!this.enabled) {
        this.reset();
      }
    }

    /* ======================================
       STATE
    ====================================== */

    getLastAnalysis() {
      return this.lastAnalysis;
    }

    getStats() {
      return {
        enabled: this.enabled,
        threshold: this.threshold,
        cooldown: this.cooldown,
        sceneCount: this.sceneCount,
        analysisCount: this.analysisCount,
        lastSceneChange: this.lastSceneChange,
        lastAnalysis: this.lastAnalysis,
      };
    }

    /* ======================================
       RESET
    ====================================== */

    reset() {
      this.referenceFrame = null;
      this.latestFrame = null;

      this.lastSceneChange = 0;
      this.lastAnalysis = null;

      this.sceneCount = 0;
      this.analysisCount = 0;
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.reset();

      this.enabled = false;
      this.destroyed = true;
    }
  }

  AF.SceneDetector = SceneDetector;
  AF.sceneDetector = new SceneDetector();
})();
