/**
 * YouTube Ambient Flow
 * Video Analyzer
 *
 * Coordinates video detection, frame sampling, color extraction,
 * adaptive performance, and ambient theme updates.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const DEFAULTS = {
    enabled: true,
    samplingInterval: 700,
    sceneThreshold: 18,
    ambientGlow: true,
    glowIntensity: 0.65,
    performanceMode: "balanced",
    smoothTransitions: true,
    freezeBackground: false,
    frozen: false,
    frozenColor: "#202020",
  };

  class VideoAnalyzer {
    constructor() {
      this.settings = { ...DEFAULTS };

      this.video = null;
      this.isRunning = false;
      this.isDestroyed = false;
      this.isEnabled = true;
      this.isFrozen = false;
      this.isCanvasBlocked = false;

      this.timer = null;
      this.sampleInProgress = false;
      this.lastSampleTime = 0;
      this.lastVideoId = null;

      this.performanceEngine = AF.performanceEngine || null;
      this.colorExtractor = AF.colorExtractor || null;
      this.themeEngine = AF.themeEngine || null;
      this.ambientGlow = AF.ambientGlow || null;
      this.videoDetector = AF.videoDetector || null;
      this.youtubeDetector = AF.youtubeDetector || null;
      this.shortsSupport = AF.shortsSupport || null;

      this.listeners = new Map();
      this.unsubscribers = [];

      this.stats = {
        samples: 0,
        successfulSamples: 0,
        failedSamples: 0,
        sceneChanges: 0,
        lastColor: null,
        lastError: null,
        startedAt: null,
      };
    }

    on(event, callback) {
      if (typeof callback !== "function") return () => {};

      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }

      this.listeners.get(event).add(callback);

      return () => this.off(event, callback);
    }

    off(event, callback) {
      this.listeners.get(event)?.delete(callback);
    }

    emit(event, data = {}) {
      const callbacks = this.listeners.get(event);

      if (!callbacks) return;

      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error("[AmbientFlow] Listener error:", error);
        }
      });
    }

    async loadSettings() {
      try {
        if (AF.storage?.getAll) {
          const stored = await AF.storage.getAll();

          this.settings = {
            ...DEFAULTS,
            ...(stored || {}),
          };
        } else if (AF.storage?.get) {
          const stored = await AF.storage.get();

          this.settings = {
            ...DEFAULTS,
            ...(stored || {}),
          };
        }

        this.isEnabled = this.settings.enabled !== false;
        this.isFrozen = Boolean(
          this.settings.frozen || this.settings.freezeBackground,
        );

        this.configureEngines();

        return this.settings;
      } catch (error) {
        console.warn("[AmbientFlow] Could not load settings:", error);

        this.settings = { ...DEFAULTS };
        this.configureEngines();

        return this.settings;
      }
    }

    configureEngines() {
      if (this.colorExtractor) {
        this.colorExtractor.setSceneThreshold?.(this.settings.sceneThreshold);
      }

      if (this.performanceEngine) {
        this.performanceEngine.setMode?.(this.settings.performanceMode);

        this.performanceEngine.configure?.({
          mode: this.settings.performanceMode,
          samplingInterval: this.settings.samplingInterval,
        });
      }

      if (this.ambientGlow) {
        this.ambientGlow.setIntensity?.(this.settings.glowIntensity);
      }
    }

    subscribeToEvents() {
      if (this.videoDetector?.on) {
        const events = [
          "videoDetected",
          "videoPlaying",
          "videoPaused",
          "videoEnded",
          "videoRemoved",
          "playbackChange",
        ];

        events.forEach((event) => {
          const unsubscribe = this.videoDetector.on(event, (data) =>
            this.handleVideoEvent(event, data),
          );

          if (typeof unsubscribe === "function") {
            this.unsubscribers.push(unsubscribe);
          }
        });
      }

      if (this.youtubeDetector?.onChange) {
        const unsubscribe = this.youtubeDetector.onChange((page) =>
          this.handleNavigation(page),
        );

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }
      }

      if (this.shortsSupport?.on) {
        const unsubscribe = this.shortsSupport.on("videoChanged", (data) =>
          this.handleShortsVideo(data),
        );

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }
      }
    }

    handleVideoEvent(event, data = {}) {
      const detectedVideo = data.video || data.element || data.target || null;

      if (detectedVideo instanceof HTMLVideoElement) {
        this.setVideo(detectedVideo);
      }

      switch (event) {
        case "videoDetected":
          if (this.video) {
            this.syncPlaybackState();
          }
          break;

        case "videoPlaying":
          this.syncPlaybackState();
          break;

        case "videoPaused":
        case "videoEnded":
        case "videoRemoved":
          this.stopSampling();
          this.restoreTheme();
          break;

        case "playbackChange":
          this.syncPlaybackState();
          break;

        default:
          break;
      }
    }

    handleNavigation() {
      const currentId = this.getCurrentVideoId();

      if (currentId !== this.lastVideoId) {
        this.lastVideoId = currentId;
        this.setVideo(this.findVideo());
      }

      this.syncPlaybackState();
    }

    handleShortsVideo(data = {}) {
      const video = data.video || data.element;

      if (video instanceof HTMLVideoElement) {
        this.setVideo(video);
        this.syncPlaybackState();
      }
    }

    getCurrentVideoId() {
      try {
        const url = new URL(window.location.href);

        if (url.pathname === "/watch") {
          return url.searchParams.get("v");
        }

        if (url.pathname.startsWith("/shorts/")) {
          return url.pathname.split("/")[2] || null;
        }

        return null;
      } catch {
        return null;
      }
    }

    findVideo() {
      const selectors = [
        "#movie_player video.html5-main-video",
        "ytd-player video",
        "ytd-reel-video-renderer video",
        "video.html5-main-video",
        "video",
      ];

      for (const selector of selectors) {
        const video = document.querySelector(selector);

        if (video instanceof HTMLVideoElement) {
          return video;
        }
      }

      return null;
    }

    setVideo(video) {
      if (!(video instanceof HTMLVideoElement)) return;

      if (this.video === video) return;

      this.stopSampling();
      this.restoreTheme();

      this.video = video;
      this.isCanvasBlocked = false;
      this.lastSampleTime = 0;

      this.colorExtractor?.reset?.();
      this.performanceEngine?.reset?.();

      this.emit("videoChanged", { video });

      this.syncPlaybackState();
    }

    syncPlaybackState() {
      if (this.isDestroyed || !this.isEnabled) {
        this.stopSampling();
        return;
      }

      if (!this.video || !this.video.isConnected) {
        const detected = this.findVideo();

        if (detected && detected !== this.video) {
          this.setVideo(detected);
        } else {
          this.stopSampling();
          this.restoreTheme();
          return;
        }
      }

      if (
        !this.video ||
        this.video.paused ||
        this.video.ended ||
        this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        this.stopSampling();
        this.restoreTheme();
        return;
      }

      if (this.isCanvasBlocked) {
        this.stopSampling();
        return;
      }

      this.startSampling();
    }

    getSamplingInterval() {
      const configured =
        Number(this.settings.samplingInterval) || DEFAULTS.samplingInterval;

      if (!this.performanceEngine) {
        return configured;
      }

      let recommended = configured;

      try {
        if (
          typeof this.performanceEngine.getRecommendedInterval === "function"
        ) {
          recommended =
            this.performanceEngine.getRecommendedInterval(configured);
        } else if (
          typeof this.performanceEngine.getSamplingInterval === "function"
        ) {
          recommended = this.performanceEngine.getSamplingInterval();
        }
      } catch (error) {
        console.warn("[AmbientFlow] Performance interval error:", error);
      }

      const interval = Number(recommended);

      if (!Number.isFinite(interval)) {
        return configured;
      }

      return Math.max(250, Math.min(5000, interval));
    }

    startSampling() {
      if (
        this.isDestroyed ||
        !this.isEnabled ||
        this.isRunning ||
        this.isFrozen ||
        !this.video ||
        this.video.paused ||
        this.video.ended ||
        this.isCanvasBlocked
      ) {
        return;
      }

      this.isRunning = true;
      this.stats.startedAt = Date.now();

      this.emit("samplingStarted", {
        video: this.video,
      });

      this.scheduleNextSample(0);
    }

    scheduleNextSample(delay) {
      this.clearTimer();

      if (!this.isRunning) return;

      this.timer = window.setTimeout(() => {
        this.sampleFrame();
      }, delay);
    }

    clearTimer() {
      if (this.timer !== null) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
    }

    stopSampling() {
      this.clearTimer();

      const wasRunning = this.isRunning;

      this.isRunning = false;
      this.sampleInProgress = false;

      if (wasRunning) {
        this.emit("samplingStopped");
      }
    }

    async sampleFrame() {
      if (!this.isRunning || this.sampleInProgress || this.isDestroyed) {
        return;
      }

      if (
        !this.video ||
        !this.video.isConnected ||
        this.video.paused ||
        this.video.ended
      ) {
        this.stopSampling();
        this.restoreTheme();
        return;
      }

      this.sampleInProgress = true;

      const startedAt = performance.now();

      try {
        if (!this.colorExtractor?.analyze) {
          throw new Error("ColorExtractor is unavailable.");
        }

        const result = await this.colorExtractor.analyze(this.video);

        const processingTime = performance.now() - startedAt;

        this.performanceEngine?.recordSample?.({
          processingTime,
          success: Boolean(result?.success),
          sceneChanged: Boolean(result?.sceneChanged),
        });

        this.stats.samples++;

        if (!result?.success) {
          this.stats.failedSamples++;

          const errorCode =
            result?.code ||
            result?.error?.code ||
            result?.error ||
            "ANALYSIS_FAILED";

          this.stats.lastError = String(errorCode);

          if (errorCode === "CANVAS_BLOCKED" || errorCode === "SecurityError") {
            this.handleCanvasBlocked(errorCode);
            return;
          }

          this.emit("sampleError", {
            error: errorCode,
          });

          return;
        }

        this.stats.successfulSamples++;
        this.stats.lastError = null;

        const color = result.color || result.dominantColor || result.rawColor;

        if (!color) return;

        this.stats.lastColor = color;

        if (result.sceneChanged) {
          this.stats.sceneChanges++;

          this.emit("sceneChanged", {
            scene: result.scene,
            color,
          });
        }

        if (!this.isFrozen) {
          this.applyColor(color, result);
        }

        this.emit("sample", {
          ...result,
          processingTime,
        });
      } catch (error) {
        this.stats.failedSamples++;
        this.stats.lastError = error?.message || String(error);

        if (
          error?.name === "SecurityError" ||
          error?.code === "CANVAS_BLOCKED"
        ) {
          this.handleCanvasBlocked("CANVAS_BLOCKED");
          return;
        }

        this.emit("sampleError", { error });
      } finally {
        this.sampleInProgress = false;

        if (
          this.isRunning &&
          !this.isDestroyed &&
          this.video &&
          !this.video.paused &&
          !this.video.ended
        ) {
          this.scheduleNextSample(this.getSamplingInterval());
        }
      }
    }

    applyColor(color, result = {}) {
      if (!color || this.isFrozen || !this.isEnabled) return;

      if (this.themeEngine?.applyColor) {
        this.themeEngine.applyColor(color, {
          sceneChanged: Boolean(result.sceneChanged),
          smooth: this.settings.smoothTransitions,
        });
      } else if (this.themeEngine?.apply) {
        this.themeEngine.apply(color);
      }

      if (this.settings.ambientGlow && this.ambientGlow) {
        this.ambientGlow.update?.(color);
        this.ambientGlow.setColor?.(color);
        this.ambientGlow.show?.();
      }
    }

    handleCanvasBlocked(reason) {
      this.isCanvasBlocked = true;

      this.stopSampling();
      this.restoreTheme();

      this.stats.lastError = reason;

      this.emit("canvasBlocked", {
        reason,
        message:
          "Video frame access is blocked. Ambient analysis is disabled for this video.",
      });
    }

    restoreTheme() {
      this.themeEngine?.reset?.();
      this.ambientGlow?.hide?.();
      this.ambientGlow?.reset?.();

      this.emit("themeRestored");
    }

    async handleSettingsChange(newSettings = {}) {
      if (!newSettings || typeof newSettings !== "object") {
        return this.settings;
      }

      this.settings = {
        ...this.settings,
        ...newSettings,
      };

      this.isEnabled = this.settings.enabled !== false;

      this.isFrozen = Boolean(
        this.settings.frozen || this.settings.freezeBackground,
      );

      this.configureEngines();

      if (!this.isEnabled) {
        this.stopSampling();
        this.restoreTheme();
        return this.settings;
      }

      if (this.isFrozen) {
        this.stopSampling();

        if (this.settings.frozenColor) {
          this.applyColor(this.settings.frozenColor);
        }

        return this.settings;
      }

      if (this.video && !this.video.paused && !this.video.ended) {
        this.stopSampling();
        this.startSampling();
      }

      return this.settings;
    }

    setEnabled(enabled) {
      this.isEnabled = Boolean(enabled);
      this.settings.enabled = this.isEnabled;

      if (!this.isEnabled) {
        this.stopSampling();
        this.restoreTheme();
      } else {
        this.isCanvasBlocked = false;
        this.syncPlaybackState();
      }

      this.emit("enabledChanged", {
        enabled: this.isEnabled,
      });
    }

    freeze(color) {
      this.isFrozen = true;
      this.settings.frozen = true;
      this.settings.freezeBackground = true;

      this.stopSampling();

      if (color) {
        this.settings.frozenColor = color;
        this.applyColor(color);
      }
    }

    unfreeze() {
      this.isFrozen = false;
      this.settings.frozen = false;
      this.settings.freezeBackground = false;

      this.syncPlaybackState();
    }

    getStatus() {
      return {
        enabled: this.isEnabled,
        running: this.isRunning,
        frozen: this.isFrozen,
        canvasBlocked: this.isCanvasBlocked,
        videoConnected: Boolean(this.video && this.video.isConnected),
        paused: this.video?.paused ?? true,
        ended: this.video?.ended ?? false,
        samplingInterval: this.getSamplingInterval(),
        settings: { ...this.settings },
        stats: { ...this.stats },
      };
    }

    async start() {
      if (this.isDestroyed) {
        throw new Error("Cannot start a destroyed VideoAnalyzer.");
      }

      await this.loadSettings();

      this.subscribeToEvents();

      this.videoDetector?.start?.();
      this.youtubeDetector?.start?.();
      this.shortsSupport?.start?.();

      this.video = this.findVideo();

      if (this.video) {
        this.lastVideoId = this.getCurrentVideoId();
      }

      this.syncPlaybackState();

      this.emit("started");

      return this.getStatus();
    }

    stop() {
      this.stopSampling();

      this.videoDetector?.stop?.();
      this.youtubeDetector?.stop?.();
      this.shortsSupport?.stop?.();

      this.restoreTheme();

      this.emit("stopped");
    }

    destroy() {
      if (this.isDestroyed) return;

      this.stop();

      this.unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn("[AmbientFlow] Unsubscribe error:", error);
        }
      });

      this.unsubscribers = [];

      this.colorExtractor?.destroy?.();
      this.performanceEngine?.destroy?.();
      this.themeEngine?.destroy?.();
      this.ambientGlow?.destroy?.();

      this.listeners.clear();

      this.video = null;
      this.isDestroyed = true;

      this.emit("destroyed");
    }
  }

  AF.VideoAnalyzer = VideoAnalyzer;

  AF.videoAnalyzer = AF.videoAnalyzer || new VideoAnalyzer();
})();
