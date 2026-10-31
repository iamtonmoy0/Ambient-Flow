/* ==========================================
   YOUTUBE AMBIENT FLOW
   Playback-Aware Video Analyzer
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class VideoAnalyzer {
    constructor() {
      this.running = false;
      this.destroyed = false;
      this.subscribed = false;

      this.settings = { ...AF.DEFAULTS };

      this.video = null;
      this.timer = null;
      this.sampling = false;
      this.lastColor = null;
      this.lastAppliedColor = null;
      this.lastSavedAt = 0;

      this.videoListeners = [];
      this.detectorListeners = [];

      this.sampleGeneration = 0;

      this.sampleInterval = 500;

      this.handlePlay = this.handlePlay.bind(this);
      this.handlePause = this.handlePause.bind(this);
      this.handleEnded = this.handleEnded.bind(this);
      this.handleVideoChange = this.handleVideoChange.bind(this);
      this.handleSettingsChange = this.handleSettingsChange.bind(this);
      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    /* ======================================
       INITIALIZATION
    ====================================== */

    async loadSettings() {
      try {
        this.settings = await AF.storage.getAll();
      } catch (error) {
        console.error("[Ambient Flow] Settings loading failed:", error);

        this.settings = { ...AF.DEFAULTS };
      }
    }

    configureEngines() {
      const mode = AF.MODES?.[this.settings.mode] || AF.MODES?.cinematic || {};

      const effectiveSettings = {
        ...this.settings,

        intensity: this.settings.intensity ?? mode.intensity ?? 68,

        saturation: this.settings.saturation ?? mode.saturation ?? 72,

        blur: this.settings.blur ?? mode.blur ?? 54,

        transitionMs: this.settings.transitionMs ?? mode.transitionMs ?? 900,
      };

      this.sampleInterval = Math.max(
        250,
        Number(this.settings.sampleInterval) || 1000,
      );

      AF.performanceEngine?.setMode(
        this.settings.performanceMode || "balanced",
      );

      AF.colorExtractor?.setEnabled(Boolean(this.settings.enabled));

      AF.sceneDetector?.setEnabled(Boolean(this.settings.sceneDetection));

      AF.readabilityEngine?.setEnabled(Boolean(this.settings.readability));

      AF.ambientGlow?.setEnabled(Boolean(this.settings.ambientGlow));

      AF.colorExtractor?.setSmoothing(
        this.settings.mode === "relax" ? 0.12 : 0.22,
      );

      if (this.settings.focusMode) {
        AF.focusMode?.enable();
      } else {
        AF.focusMode?.disable();
      }

      this.effectiveSettings = effectiveSettings;
    }

    /* ======================================
       EVENT SUBSCRIPTIONS
    ====================================== */

    subscribe() {
      if (this.subscribed) return;

      this.subscribed = true;

      const detector = AF.videoDetector;

      if (detector?.on) {
        const events = [
          "videoDetected",
          "playbackState",
          "videoMetadata",
          "videoEnded",
        ];

        for (const event of events) {
          const callback = (data) => {
            if (event === "videoDetected") {
              this.handleVideoChange(data?.video);
            }

            if (event === "playbackState") {
              this.syncPlaybackState();
            }

            if (event === "videoMetadata") {
              this.syncPlaybackState();
            }

            if (event === "videoEnded") {
              this.stopSampling();
              this.restoreYouTube();
            }
          };

          detector.on(event, callback);

          this.detectorListeners.push({
            target: detector,
            event,
            callback,
          });
        }
      }

      if (AF.youtubeDetector?.onChange) {
        const callback = () => {
          this.handleVideoChange();
        };

        AF.youtubeDetector.onChange(callback);

        this.detectorListeners.push({
          target: AF.youtubeDetector,
          event: "change",
          callback,
        });
      }

      window.addEventListener(
        AF.EVENTS?.SETTINGS_CHANGED || "af:settings-changed",
        this.handleSettingsChange,
      );

      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }

    unsubscribe() {
      for (const item of this.detectorListeners) {
        if (typeof item.target.off === "function") {
          item.target.off(item.event, item.callback);
        }
      }

      this.detectorListeners = [];
      this.subscribed = false;

      window.removeEventListener(
        AF.EVENTS?.SETTINGS_CHANGED || "af:settings-changed",
        this.handleSettingsChange,
      );

      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }

    /* ======================================
       VIDEO DETECTION
    ====================================== */

    findVideo() {
      const detected = AF.videoDetector?.getState?.();

      const detectedVideo = detected?.video || detected?.element || null;

      if (
        detectedVideo instanceof HTMLVideoElement &&
        detectedVideo.isConnected
      ) {
        return detectedVideo;
      }

      const videos = Array.from(document.querySelectorAll("video"));

      return (
        videos.find(
          (video) =>
            video.isConnected &&
            video.readyState >= 1 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0,
        ) || null
      );
    }

    handleVideoChange(video = null) {
      const nextVideo =
        video instanceof HTMLVideoElement && video.isConnected
          ? video
          : this.findVideo();

      if (nextVideo === this.video) {
        this.syncPlaybackState();
        return;
      }

      this.detachVideoListeners();
      this.stopSampling();

      this.video = nextVideo;

      if (!this.video) {
        this.restoreYouTube();
        return;
      }

      this.attachVideoListeners();

      this.syncPlaybackState();
    }

    attachVideoListeners() {
      if (!this.video) return;

      const events = [
        ["play", this.handlePlay],
        ["playing", this.handlePlay],
        ["pause", this.handlePause],
        ["ended", this.handleEnded],
        ["emptied", this.handlePause],
        ["waiting", this.handlePause],
      ];

      for (const [event, callback] of events) {
        this.video.addEventListener(event, callback);

        this.videoListeners.push({
          event,
          callback,
        });
      }
    }

    detachVideoListeners() {
      if (this.video) {
        for (const item of this.videoListeners) {
          this.video.removeEventListener(item.event, item.callback);
        }
      }

      this.videoListeners = [];
    }

    /* ======================================
       PLAYBACK STATE
    ====================================== */

    isPlaying() {
      const video = this.video;

      return Boolean(
        video &&
        video.isConnected &&
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        video.readyState >= 2 &&
        !document.hidden,
      );
    }

    handlePlay() {
      this.syncPlaybackState();
    }

    handlePause() {
      this.stopSampling();
      this.restoreYouTube();
    }

    handleEnded() {
      this.stopSampling();
      this.restoreYouTube();
    }

    handleVisibilityChange() {
      if (document.hidden) {
        this.stopSampling();
        this.restoreYouTube();
      } else {
        this.syncPlaybackState();
      }
    }

    syncPlaybackState() {
      if (!this.running || !this.settings.enabled || !this.video) {
        this.stopSampling();
        this.restoreYouTube();
        return;
      }

      if (this.isPlaying()) {
        this.startSampling();
      } else {
        this.stopSampling();
        this.restoreYouTube();
      }
    }

    /* ======================================
       SAMPLING CONTROL
    ====================================== */

    startSampling() {
      if (
        this.sampling ||
        !this.running ||
        !this.settings.enabled ||
        !this.isPlaying()
      ) {
        return;
      }

      this.sampling = true;

      const generation = ++this.sampleGeneration;

      // Analyze immediately when playback begins.
      this.scheduleSample(0, generation);
    }

    stopSampling() {
      this.sampling = false;

      // Invalidates any outstanding scheduled sample.
      this.sampleGeneration++;

      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }

      AF.sceneDetector?.reset();
    }

    scheduleSample(delay, generation) {
      if (!this.sampling || generation !== this.sampleGeneration) {
        return;
      }

      this.timer = setTimeout(async () => {
        this.timer = null;

        if (
          !this.sampling ||
          generation !== this.sampleGeneration ||
          !this.isPlaying()
        ) {
          this.stopSampling();
          this.restoreYouTube();
          return;
        }

        await this.sampleFrame(generation);

        if (
          this.sampling &&
          generation === this.sampleGeneration &&
          this.isPlaying()
        ) {
          this.scheduleSample(this.sampleInterval, generation);
        }
      }, delay);
    }

    /* ======================================
       VIDEO FRAME ANALYSIS
    ====================================== */

    async sampleFrame(generation) {
      if (
        !this.video ||
        !this.isPlaying() ||
        !this.sampling ||
        generation !== this.sampleGeneration
      ) {
        return;
      }

      if (
        AF.performanceEngine?.canSample &&
        !AF.performanceEngine.canSample(this.video)
      ) {
        return;
      }

      try {
        const result = await AF.colorExtractor.analyze(this.video, {
          colorSource: this.settings.colorSource,
        });

        // Playback may have stopped while analysis was running.
        if (
          !this.sampling ||
          generation !== this.sampleGeneration ||
          !this.isPlaying()
        ) {
          return;
        }

        if (!result) return;

        if (result.success === false) {
          if (result.reason === "CANVAS_BLOCKED") {
            console.warn(
              "[Ambient Flow] Video frame access is blocked by browser security.",
            );

            this.stopSampling();
          }

          return;
        }

        const color = this.extractColor(result);

        if (!color) return;

        this.lastColor = color;

        const sceneResult = AF.sceneDetector?.getLastAnalysis?.();

        const sceneChanged = sceneResult?.changed === true;

        // Apply the latest color on scene changes or meaningful
        // color updates. Do not wait for a long animation cycle.
        if (sceneChanged || color !== this.lastAppliedColor) {
          this.applyColor(color);
        }

        AF.performanceEngine?.trackFrame?.();

        AF.performanceEngine?.adapt?.();

        this.saveColorPeriodically(color);
      } catch (error) {
        console.warn("[Ambient Flow] Frame analysis failed:", error);

        if (
          error?.name === "SecurityError" ||
          error?.message?.includes("tainted")
        ) {
          this.stopSampling();
          this.restoreYouTube();
        }
      }
    }

    extractColor(result) {
      if (typeof result === "string") {
        return result;
      }

      const candidates = [
        result.color,
        result.hex,
        result.dominantColor,
        result.averageColor,
        result.palette?.primary,
      ];

      return (
        candidates.find(
          (value) =>
            typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value),
        ) || null
      );
    }

    /* ======================================
       THEME APPLICATION
    ====================================== */

    applyColor(color) {
      if (!color || !this.settings.enabled || !this.isPlaying()) {
        return;
      }

      this.lastAppliedColor = color;

      const palette = AF.paletteEngine.generate(
        color,
        this.effectiveSettings || this.settings,
      );

      const readablePalette = this.settings.readability
        ? AF.readabilityEngine.optimizePalette(palette)
        : palette;

      AF.themeEngine.applyPalette(
        readablePalette,
        this.effectiveSettings || this.settings,
      );

      if (this.settings.ambientGlow) {
        AF.ambientGlow?.update(color, this.effectiveSettings || this.settings);

        AF.ambientGlow?.show();
      }
    }

    restoreYouTube() {
      this.lastAppliedColor = null;

      // Remove generated theme and restore original page styles.
      AF.themeEngine?.reset();

      // Remove all ambient lighting.
      AF.ambientGlow?.hide();
    }

    /* ======================================
       COLOR STORAGE
    ====================================== */

    saveColorPeriodically(color) {
      const now = Date.now();

      if (now - this.lastSavedAt < 10000) {
        return;
      }

      this.lastSavedAt = now;

      AF.storage?.saveLastColor?.(color);

      AF.storage?.saveChannelColor?.(color);
    }

    /* ======================================
       SETTINGS UPDATES
    ====================================== */

    async handleSettingsChange() {
      await this.loadSettings();

      this.configureEngines();

      if (!this.settings.enabled) {
        this.stopSampling();
        this.restoreYouTube();
        return;
      }

      this.syncPlaybackState();
    }

    /* ======================================
       PUBLIC CONTROL
    ====================================== */

    async start() {
      if (this.running || this.destroyed) return;

      this.running = true;

      await this.loadSettings();

      this.configureEngines();

      this.subscribe();

      AF.videoDetector?.start();
      AF.youtubeDetector?.start();

      if (this.settings.shortsSupport) {
        AF.shortsSupport?.start();
      }

      this.handleVideoChange();

      if (!this.settings.enabled) {
        this.stopSampling();
        this.restoreYouTube();
      }

      return true;
    }

    async stop() {
      this.running = false;

      this.stopSampling();

      this.detachVideoListeners();

      this.video = null;

      AF.videoDetector?.stop();
      AF.youtubeDetector?.stop();
      AF.shortsSupport?.stop();

      this.restoreYouTube();

      AF.colorExtractor?.reset();
      AF.performanceEngine?.reset();

      return true;
    }

    async setEnabled(enabled) {
      this.settings.enabled = Boolean(enabled);

      if (!this.settings.enabled) {
        this.stopSampling();
        this.restoreYouTube();
      } else {
        this.syncPlaybackState();
      }
    }

    getStatus() {
      return {
        running: this.running,
        enabled: Boolean(this.settings.enabled),
        playing: this.isPlaying(),
        sampling: this.sampling,
        videoDetected: Boolean(this.video),
        currentColor: this.lastColor,
        sampleInterval: this.sampleInterval,
      };
    }

    destroy() {
      this.stop();

      this.unsubscribe();

      this.destroyed = true;
    }
  }

  AF.VideoAnalyzer = VideoAnalyzer;
  AF.videoAnalyzer = new VideoAnalyzer();
})();
