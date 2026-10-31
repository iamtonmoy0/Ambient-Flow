/**
 * YouTube Ambient Flow
 * Video Analyzer
 *
 * Coordinates video detection, frame sampling, scene detection,
 * color extraction, and dynamic YouTube theming.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class VideoAnalyzer {
    constructor() {
      this.started = false;
      this.enabled = true;
      this.isAnalyzing = false;
      this.isPlaying = false;

      this.currentVideo = null;
      this.lastPlaybackState = "STOPPED";
      this.blockedVideo = null;

      this.sampleTimer = null;
      this.generation = 0;

      this.settings = {
        enabled: true,
        samplingInterval: 700,
        sceneDetection: true,
        sceneThreshold: 18,
        ambientGlow: true,
        smoothTransitions: true,
        performanceMode: "balanced",
        backgroundStyle: "gradient",
        intensity: 0.65,
        blur: 80,
      };

      this.unsubscribers = [];
      this.stats = {
        samples: 0,
        successfulSamples: 0,
        failedSamples: 0,
        sceneChanges: 0,
        lastSampleTime: null,
        lastColor: null,
        startedAt: null,
      };
    }

    async loadSettings() {
      try {
        if (AF.storage?.getAll) {
          const stored = await AF.storage.getAll();

          if (stored && typeof stored === "object") {
            this.settings = {
              ...this.settings,
              ...stored,
            };
          }
        }

        this.enabled = this.settings.enabled !== false;
      } catch (error) {
        console.warn("[Ambient Flow] Could not load analyzer settings:", error);
      }
    }

    configureEngines() {
      if (AF.sceneDetector) {
        AF.sceneDetector.setThreshold?.(this.settings.sceneThreshold || 18);
      }

      if (AF.ambientGlow) {
        AF.ambientGlow.setEnabled?.(this.settings.ambientGlow !== false);

        AF.ambientGlow.setIntensity?.(this.settings.intensity ?? 0.65);

        AF.ambientGlow.setBlur?.(this.settings.blur ?? 80);
      }
    }

    subscribeToDetector() {
      const detector = AF.videoDetector;

      if (!detector?.on) {
        console.warn("[Ambient Flow] VideoDetector is unavailable.");
        return;
      }

      const subscriptions = {
        videoDetected: (event) => {
          this.handleVideoChange(event?.video);
        },

        videoRemoved: (event) => {
          this.handleVideoRemoved(event?.video);
        },

        videoPlaying: (event) => {
          this.handleVideoChange(event?.video);
          this.syncPlaybackState(true);
        },

        videoPaused: () => {
          this.syncPlaybackState(false);
        },

        videoEnded: () => {
          this.syncPlaybackState(false);
        },

        videoBuffering: () => {
          // Do not restore the theme for short buffering events.
          // Playback state is checked again when playback resumes.
        },

        videoEmptied: () => {
          this.syncPlaybackState(false);
        },

        videoSeeking: () => {
          // Avoid sampling while seeking.
          this.stopSampling();
        },

        videoReady: (event) => {
          this.handleVideoChange(event?.video);
          this.syncPlaybackState();
        },

        playbackChange: (event) => {
          this.handleVideoChange(event?.video);
          this.syncPlaybackState(event?.isPlaying);
        },

        playbackCheck: (event) => {
          this.syncPlaybackState(event?.isPlaying);
        },

        navigation: () => {
          this.handleNavigation();
        },
      };

      Object.entries(subscriptions).forEach(([eventName, callback]) => {
        const unsubscribe = detector.on(eventName, callback);

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }
      });
    }

    findVideo() {
      if (AF.videoDetector?.currentVideo) {
        return AF.videoDetector.currentVideo;
      }

      const selectors = [
        "#movie_player video",
        "ytd-player video",
        "ytd-reel-video-renderer video",
        "ytd-shorts video",
      ];

      for (const selector of selectors) {
        const video = document.querySelector(selector);

        if (video instanceof HTMLVideoElement && video.isConnected) {
          return video;
        }
      }

      return null;
    }

    isVideoPlaying(video = this.currentVideo) {
      if (!video || !video.isConnected) {
        return false;
      }

      return (
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !document.hidden
      );
    }

    handleVideoChange(video) {
      if (!video || !(video instanceof HTMLVideoElement)) {
        return;
      }

      if (video === this.currentVideo) {
        return;
      }

      console.info("[Ambient Flow] Video changed.");

      this.stopSampling();

      this.currentVideo = video;
      this.blockedVideo = null;
      this.lastPlaybackState = "STOPPED";

      this.resetAnalysis();

      if (this.isVideoPlaying(video)) {
        this.syncPlaybackState(true);
      }
    }

    handleVideoRemoved(video) {
      if (video && this.currentVideo && video !== this.currentVideo) {
        return;
      }

      this.stopSampling();

      this.currentVideo = null;
      this.blockedVideo = null;
      this.lastPlaybackState = "STOPPED";

      this.restoreYouTube();
    }

    handleNavigation() {
      this.stopSampling();

      this.currentVideo = null;
      this.blockedVideo = null;
      this.lastPlaybackState = "STOPPED";

      this.resetAnalysis();
      this.restoreYouTube();

      // YouTube navigation is asynchronous. Recheck after the page updates.
      setTimeout(() => {
        if (!this.started) return;

        const video = this.findVideo();

        if (video) {
          this.handleVideoChange(video);
          this.syncPlaybackState();
        }
      }, 300);
    }

    syncPlaybackState(reportedState) {
      if (!this.started || !this.enabled) {
        return;
      }

      const video = this.currentVideo || this.findVideo();

      if (video && video !== this.currentVideo) {
        this.handleVideoChange(video);
      }

      const playing =
        typeof reportedState === "boolean"
          ? reportedState && this.isVideoPlaying(video)
          : this.isVideoPlaying(video);

      if (playing) {
        if (this.lastPlaybackState !== "PLAYING") {
          this.lastPlaybackState = "PLAYING";
          this.isPlaying = true;

          console.info("[Ambient Flow] Playback started.");

          this.startSampling();
        } else if (!this.isAnalyzing) {
          this.startSampling();
        }

        return;
      }

      if (this.lastPlaybackState !== "STOPPED") {
        console.info("[Ambient Flow] Playback stopped.");

        this.lastPlaybackState = "STOPPED";
        this.isPlaying = false;

        this.stopSampling();
        this.restoreYouTube();
      }
    }

    startSampling() {
      if (
        !this.started ||
        !this.enabled ||
        !this.settings.enabled ||
        !this.currentVideo ||
        !this.isVideoPlaying(this.currentVideo) ||
        this.blockedVideo === this.currentVideo ||
        this.isAnalyzing
      ) {
        return;
      }

      this.isAnalyzing = true;

      const generation = ++this.generation;

      this.stats.startedAt = Date.now();

      this.scheduleNextSample(generation, 0);
    }

    stopSampling() {
      this.isAnalyzing = false;
      this.generation++;

      if (this.sampleTimer) {
        clearTimeout(this.sampleTimer);
        this.sampleTimer = null;
      }

      if (AF.colorExtractor?.reset) {
        AF.colorExtractor.reset();
      }
    }

    scheduleNextSample(generation, delay) {
      if (!this.isAnalyzing || generation !== this.generation) {
        return;
      }

      this.sampleTimer = setTimeout(() => {
        this.sampleTimer = null;
        this.sampleFrame(generation);
      }, delay);
    }

    async sampleFrame(generation) {
      if (
        !this.started ||
        !this.isAnalyzing ||
        generation !== this.generation
      ) {
        return;
      }

      if (!this.isVideoPlaying(this.currentVideo)) {
        this.syncPlaybackState(false);
        return;
      }

      try {
        const result = await AF.colorExtractor?.analyze(this.currentVideo);

        if (!this.isAnalyzing || generation !== this.generation) {
          return;
        }

        this.stats.samples++;
        this.stats.lastSampleTime = Date.now();

        if (!result?.success) {
          this.stats.failedSamples++;

          this.handleAnalysisError(result);

          if (this.isAnalyzing) {
            this.scheduleNextSample(generation, this.getSamplingInterval());
          }

          return;
        }

        this.stats.successfulSamples++;

        if (result.sceneChanged) {
          this.stats.sceneChanges++;
        }

        if (result.color) {
          this.applyColor(result.color, result);
        }
      } catch (error) {
        this.stats.failedSamples++;

        console.error("[Ambient Flow] Frame analysis failed:", error);
      }

      if (this.isAnalyzing && generation === this.generation) {
        this.scheduleNextSample(generation, this.getSamplingInterval());
      }
    }

    getSamplingInterval() {
      const interval = Number(this.settings.samplingInterval);

      if (!Number.isFinite(interval)) {
        return 700;
      }

      return Math.max(300, Math.min(interval, 3000));
    }

    handleAnalysisError(result) {
      if (
        result?.error === "CANVAS_BLOCKED" ||
        result?.code === "CANVAS_BLOCKED"
      ) {
        console.warn(
          "[Ambient Flow] Browser blocked video frame extraction. " +
            "Ambient analysis is disabled for this video.",
        );

        this.blockedVideo = this.currentVideo;
        this.stopSampling();
        this.restoreYouTube();

        return;
      }

      if (result?.error) {
        console.warn("[Ambient Flow] Analysis error:", result.error);
      }
    }

    applyColor(color, result = {}) {
      if (
        !color ||
        !Number.isFinite(color.r) ||
        !Number.isFinite(color.g) ||
        !Number.isFinite(color.b)
      ) {
        return;
      }

      const hex = result.hex || this.rgbToHex(color);

      this.stats.lastColor = hex;

      const frozen = Boolean(
        this.settings.frozen || this.settings.freezeBackground,
      );

      const displayColor =
        frozen && this.settings.frozenColor
          ? this.hexToRgb(this.settings.frozenColor)
          : color;

      if (!displayColor) {
        return;
      }

      if (AF.themeEngine) {
        AF.themeEngine.apply(displayColor, this.settings);
      }

      if (AF.ambientGlow && this.settings.ambientGlow !== false) {
        AF.ambientGlow.update(displayColor, this.settings);
        AF.ambientGlow.updatePosition?.(this.currentVideo);
        AF.ambientGlow.show();
      }
    }

    rgbToHex(color) {
      const toHex = (value) => {
        return Math.max(0, Math.min(255, Math.round(value)))
          .toString(16)
          .padStart(2, "0");
      };

      return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
    }

    hexToRgb(hex) {
      if (typeof hex !== "string") {
        return null;
      }

      const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

      if (!match) {
        return null;
      }

      return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
      };
    }

    restoreYouTube() {
      AF.ambientGlow?.hide?.();
      AF.themeEngine?.reset?.();
    }

    resetAnalysis() {
      AF.colorExtractor?.reset?.();

      this.stats.lastColor = null;
    }

    async handleSettingsChange(settings = {}) {
      this.settings = {
        ...this.settings,
        ...settings,
      };

      this.enabled = this.settings.enabled !== false;

      this.configureEngines();

      if (!this.enabled) {
        this.stopSampling();
        this.restoreYouTube();
        return;
      }

      if (this.isPlaying && this.isVideoPlaying(this.currentVideo)) {
        this.stopSampling();
        this.startSampling();
      }
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      this.settings.enabled = this.enabled;

      if (!this.enabled) {
        this.stopSampling();
        this.restoreYouTube();
      } else {
        this.syncPlaybackState();
      }

      return this.enabled;
    }

    async start() {
      if (this.started) {
        return;
      }

      await this.loadSettings();

      this.configureEngines();
      this.subscribeToDetector();

      this.started = true;

      AF.videoDetector?.start?.();
      AF.youtubeDetector?.start?.();
      AF.shortsSupport?.start?.();

      this.currentVideo = this.findVideo();

      if (this.currentVideo) {
        this.syncPlaybackState();
      }

      console.info("[Ambient Flow] Video analyzer started.");
    }

    stop() {
      if (!this.started) {
        return;
      }

      this.started = false;
      this.isPlaying = false;
      this.lastPlaybackState = "STOPPED";

      this.stopSampling();

      AF.videoDetector?.stop?.();
      AF.youtubeDetector?.stop?.();
      AF.shortsSupport?.stop?.();

      this.currentVideo = null;
      this.blockedVideo = null;

      this.restoreYouTube();
    }

    getStatus() {
      return {
        started: this.started,
        enabled: this.enabled,
        isPlaying: this.isPlaying,
        isAnalyzing: this.isAnalyzing,
        hasVideo: Boolean(this.currentVideo),
        isShorts: AF.shortsSupport?.isActive?.() || false,
        canvasBlocked: this.blockedVideo === this.currentVideo,
        playbackState: this.lastPlaybackState,
        stats: { ...this.stats },
      };
    }

    destroy() {
      this.stop();

      this.unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn("[Ambient Flow] Listener cleanup failed:", error);
        }
      });

      this.unsubscribers = [];

      AF.colorExtractor?.destroy?.();
      AF.frameSampler?.destroy?.();
      AF.sceneDetector?.destroy?.();
      AF.ambientGlow?.destroy?.();
      AF.themeEngine?.reset?.();

      console.info("[Ambient Flow] Video analyzer destroyed.");
    }
  }

  AF.VideoAnalyzer = VideoAnalyzer;
  AF.videoAnalyzer = AF.videoAnalyzer || new VideoAnalyzer();
})();
