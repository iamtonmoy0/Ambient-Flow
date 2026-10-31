/**
 * YouTube Ambient Flow
 * Performance Engine
 *
 * Dynamically adjusts frame sampling based on processing time,
 * frame failures, visibility, and selected performance preset.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class PerformanceEngine {
    constructor(options = {}) {
      this.mode = options.mode || "balanced";

      this.enabled = true;

      this.minInterval = 300;
      this.maxInterval = 3000;

      this.baseIntervals = {
        battery: 1500,
        balanced: 700,
        quality: 400,
      };

      this.currentInterval = this.baseIntervals[this.mode] || 700;

      this.averageProcessingTime = 0;
      this.averageFailureRate = 0;

      this.samples = [];
      this.maxSamples = 20;

      this.lastAdjustment = 0;
      this.adjustmentCooldown = 1500;

      this.metrics = {
        totalSamples: 0,
        successfulSamples: 0,
        failedSamples: 0,
        averageProcessingTime: 0,
        lastProcessingTime: 0,
        adjustments: 0,
      };
    }

    setMode(mode) {
      if (!this.baseIntervals[mode]) {
        return false;
      }

      this.mode = mode;

      this.currentInterval = this.baseIntervals[mode];

      this.samples = [];
      this.averageProcessingTime = 0;
      this.averageFailureRate = 0;

      return true;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
    }

    recordSample(processingTime, successful = true) {
      if (!this.enabled) {
        return;
      }

      const duration = Math.max(0, Number(processingTime) || 0);

      const sample = {
        processingTime: duration,
        successful: Boolean(successful),
        timestamp: Date.now(),
      };

      this.samples.push(sample);

      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }

      this.metrics.totalSamples++;

      if (successful) {
        this.metrics.successfulSamples++;
      } else {
        this.metrics.failedSamples++;
      }

      this.metrics.lastProcessingTime = duration;

      this.calculateMetrics();
      this.adjustInterval();
    }

    calculateMetrics() {
      if (!this.samples.length) {
        return;
      }

      const totalProcessingTime = this.samples.reduce(
        (sum, sample) => sum + sample.processingTime,
        0,
      );

      const failures = this.samples.filter(
        (sample) => !sample.successful,
      ).length;

      this.averageProcessingTime = totalProcessingTime / this.samples.length;

      this.averageFailureRate = failures / this.samples.length;

      this.metrics.averageProcessingTime = this.averageProcessingTime;
    }

    adjustInterval() {
      if (!this.enabled || this.mode === "battery") {
        this.currentInterval = this.baseIntervals[this.mode];
        return;
      }

      const now = Date.now();

      if (now - this.lastAdjustment < this.adjustmentCooldown) {
        return;
      }

      this.lastAdjustment = now;

      let nextInterval = this.baseIntervals[this.mode];

      // If analysis is slow, reduce sampling frequency.
      if (this.averageProcessingTime > 180) {
        nextInterval += 300;
      } else if (this.averageProcessingTime > 100) {
        nextInterval += 150;
      }

      // Frequent failures usually indicate resource pressure.
      if (this.averageFailureRate > 0.25) {
        nextInterval += 300;
      }

      // Avoid aggressive sampling on devices under load.
      if (
        typeof navigator !== "undefined" &&
        navigator.hardwareConcurrency &&
        navigator.hardwareConcurrency <= 2
      ) {
        nextInterval += 200;
      }

      if (
        typeof navigator !== "undefined" &&
        navigator.deviceMemory &&
        navigator.deviceMemory <= 2
      ) {
        nextInterval += 200;
      }

      // Keep the sampling interval within safe limits.
      nextInterval = Math.max(
        this.minInterval,
        Math.min(this.maxInterval, nextInterval),
      );

      if (nextInterval !== this.currentInterval) {
        this.currentInterval = nextInterval;
        this.metrics.adjustments++;
      }
    }

    getRecommendedInterval() {
      if (!this.enabled) {
        return this.maxInterval;
      }

      if (document.hidden) {
        return this.maxInterval;
      }

      return this.currentInterval;
    }

    getMetrics() {
      return {
        mode: this.mode,
        enabled: this.enabled,
        currentInterval: this.currentInterval,
        averageProcessingTime: Math.round(this.averageProcessingTime),
        averageFailureRate: Number(this.averageFailureRate.toFixed(3)),
        ...this.metrics,
      };
    }

    reset() {
      this.samples = [];

      this.averageProcessingTime = 0;
      this.averageFailureRate = 0;

      this.currentInterval = this.baseIntervals[this.mode] || 700;

      this.lastAdjustment = 0;

      this.metrics = {
        totalSamples: 0,
        successfulSamples: 0,
        failedSamples: 0,
        averageProcessingTime: 0,
        lastProcessingTime: 0,
        adjustments: 0,
      };
    }

    destroy() {
      this.reset();
      this.enabled = false;
    }
  }

  AF.PerformanceEngine = PerformanceEngine;

  AF.performanceEngine = AF.performanceEngine || new PerformanceEngine();
})();

/**
 * YouTube Ambient Flow
 * Adaptive Performance Engine
 *
 * Dynamically adjusts frame-sampling frequency according
 * to processing time, success rate, and performance mode.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class PerformanceEngine {
    constructor(options = {}) {
      this.modes = {
        battery: {
          minInterval: 1800,
          maxInterval: 4000,
          targetProcessingTime: 120,
          maxFailureRate: 0.25,
        },

        balanced: {
          minInterval: 700,
          maxInterval: 2500,
          targetProcessingTime: 90,
          maxFailureRate: 0.15,
        },

        quality: {
          minInterval: 350,
          maxInterval: 1200,
          targetProcessingTime: 60,
          maxFailureRate: 0.1,
        },
      };

      this.mode = this.normalizeMode(options.mode || "balanced");

      this.baseInterval = this.modes[this.mode].minInterval;

      this.samples = [];
      this.maxSamples = 30;

      this.totalSamples = 0;
      this.successfulSamples = 0;
      this.failedSamples = 0;
      this.sceneChanges = 0;

      this.averageProcessingTime = 0;
      this.failureRate = 0;

      this.currentInterval = this.baseInterval;

      this.lastSampleAt = 0;
      this.lastAdjustmentAt = 0;

      this.isDestroyed = false;

      this.deviceInfo = this.detectDevice();
    }

    normalizeMode(mode) {
      return Object.prototype.hasOwnProperty.call(
        this.modes || {
          battery: true,
          balanced: true,
          quality: true,
        },
        mode,
      )
        ? mode
        : "balanced";
    }

    detectDevice() {
      const memory = Number(navigator.deviceMemory || 0);

      const cores = Number(navigator.hardwareConcurrency || 0);

      const connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;

      return {
        memory,
        cores,
        saveData: Boolean(connection?.saveData),
        effectiveType: connection?.effectiveType || "unknown",
        isLowEnd: (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4),
      };
    }

    getModeConfig() {
      return this.modes[this.mode];
    }

    setMode(mode) {
      if (!Object.prototype.hasOwnProperty.call(this.modes, mode)) {
        return false;
      }

      this.mode = mode;

      const config = this.getModeConfig();

      this.baseInterval = config.minInterval;

      this.currentInterval = this.clampInterval(this.currentInterval);

      return true;
    }

    setBaseInterval(interval) {
      const value = Number(interval);

      if (!Number.isFinite(value) || value <= 0) {
        return false;
      }

      this.baseInterval = value;

      this.currentInterval = this.clampInterval(value);

      return true;
    }

    clampInterval(interval) {
      const config = this.getModeConfig();

      return Math.max(
        config.minInterval,
        Math.min(config.maxInterval, interval),
      );
    }

    recordSample({
      processingTime = 0,
      success = true,
      sceneChanged = false,
    } = {}) {
      if (this.isDestroyed) return;

      const duration = Number(processingTime);

      const validDuration =
        Number.isFinite(duration) && duration >= 0 ? duration : 0;

      const sample = {
        processingTime: validDuration,
        success: Boolean(success),
        sceneChanged: Boolean(sceneChanged),
        timestamp: Date.now(),
      };

      this.samples.push(sample);

      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }

      this.totalSamples++;

      if (sample.success) {
        this.successfulSamples++;
      } else {
        this.failedSamples++;
      }

      if (sample.sceneChanged) {
        this.sceneChanges++;
      }

      this.lastSampleAt = sample.timestamp;

      this.updateMetrics();

      return this.getStatus();
    }

    updateMetrics() {
      if (!this.samples.length) return;

      const successful = this.samples.filter((sample) => sample.success);

      const total = this.samples.length;

      const processingTotal = successful.reduce(
        (sum, sample) => sum + sample.processingTime,
        0,
      );

      this.averageProcessingTime =
        successful.length > 0 ? processingTotal / successful.length : 0;

      const failures = this.samples.filter((sample) => !sample.success).length;

      this.failureRate = failures / total;
    }

    getRecommendedInterval(configuredInterval) {
      if (this.isDestroyed) {
        return this.currentInterval;
      }

      const configured = Number(configuredInterval);

      if (Number.isFinite(configured) && configured > 0) {
        this.baseInterval = configured;
      }

      const config = this.getModeConfig();

      let recommended = Math.max(config.minInterval, this.baseInterval);

      recommended = Math.min(recommended, config.maxInterval);

      // Reduce sampling frequency on lower-end devices.
      if (this.deviceInfo.isLowEnd) {
        recommended *= 1.4;
      }

      // Respect browser data-saving preferences.
      if (this.deviceInfo.saveData) {
        recommended *= 1.5;
      }

      // Network quality is only a weak performance hint.
      if (
        this.deviceInfo.effectiveType === "slow-2g" ||
        this.deviceInfo.effectiveType === "2g"
      ) {
        recommended *= 1.2;
      }

      if (this.samples.length >= 3) {
        const target = config.targetProcessingTime;

        // Processing is taking too long.
        if (this.averageProcessingTime > target * 1.5) {
          recommended *= 1.5;
        } else if (this.averageProcessingTime > target) {
          recommended *= 1.2;
        }

        // Too many failed samples indicate poor performance
        // or inaccessible video frames.
        if (this.failureRate > config.maxFailureRate) {
          recommended *= 1.5;
        } else if (this.failureRate > 0.1) {
          recommended *= 1.2;
        }

        // A very slow processing average should not cause
        // sampling to become excessively frequent.
        if (
          this.averageProcessingTime < target * 0.5 &&
          this.failureRate < 0.05
        ) {
          recommended *= 0.9;
        }
      }

      // Limit sudden changes to avoid unstable intervals.
      const previous = this.currentInterval;

      const maximumIncrease = previous * 1.5;
      const maximumDecrease = previous * 0.8;

      recommended = Math.max(
        maximumDecrease,
        Math.min(maximumIncrease, recommended),
      );

      this.currentInterval = this.clampInterval(recommended);

      this.lastAdjustmentAt = Date.now();

      return Math.round(this.currentInterval);
    }

    getSamplingInterval(configuredInterval) {
      return this.getRecommendedInterval(configuredInterval);
    }

    recordProcessingTime(processingTime) {
      return this.recordSample({
        processingTime,
        success: true,
      });
    }

    recordSuccess(processingTime = 0) {
      return this.recordSample({
        processingTime,
        success: true,
      });
    }

    recordFailure(processingTime = 0) {
      return this.recordSample({
        processingTime,
        success: false,
      });
    }

    recordSceneChange() {
      this.sceneChanges++;
    }

    getStatus() {
      return {
        mode: this.mode,
        currentInterval: Math.round(this.currentInterval),
        baseInterval: Math.round(this.baseInterval),
        averageProcessingTime: Math.round(this.averageProcessingTime),
        failureRate: Number(this.failureRate.toFixed(3)),
        totalSamples: this.totalSamples,
        successfulSamples: this.successfulSamples,
        failedSamples: this.failedSamples,
        sceneChanges: this.sceneChanges,
        device: { ...this.deviceInfo },
        destroyed: this.isDestroyed,
      };
    }

    reset() {
      this.samples = [];

      this.totalSamples = 0;
      this.successfulSamples = 0;
      this.failedSamples = 0;
      this.sceneChanges = 0;

      this.averageProcessingTime = 0;
      this.failureRate = 0;

      this.lastSampleAt = 0;
      this.lastAdjustmentAt = 0;

      this.currentInterval = this.clampInterval(this.baseInterval);
    }

    destroy() {
      if (this.isDestroyed) return;

      this.reset();
      this.isDestroyed = true;
    }
  }

  AF.PerformanceEngine = PerformanceEngine;

  AF.performanceEngine = AF.performanceEngine || new PerformanceEngine();
})();
