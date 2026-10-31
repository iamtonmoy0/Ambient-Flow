/**
 * YouTube Ambient Flow
 * Reliable Video and Playback Detector
 *
 * Features:
 * - Detects standard YouTube videos.
 * - Detects YouTube Shorts.
 * - Tracks play, pause, buffering, seeking and ended states.
 * - Detects YouTube SPA navigation.
 * - Detects video element replacement and source changes.
 * - Separates playback state from tab visibility.
 * - Provides compatibility events for VideoAnalyzer.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class VideoDetector {
    constructor(options = {}) {
      this.currentVideo = null;
      this.currentSource = "";

      this.observer = null;
      this.navigationObserver = null;

      this.running = false;
      this.destroyed = false;

      this.events = new Map();

      this.intervalTimer = null;
      this.navigationTimer = null;

      this.scanInterval = options.scanInterval || 1000;

      this.lastUrl = location.href;
      this.videoListeners = [];

      this.handleVideoEvent = this.handleVideoEvent.bind(this);

      this.handleMutations = this.handleMutations.bind(this);

      this.handleNavigation = this.handleNavigation.bind(this);

      this.handleVisibility = this.handleVisibility.bind(this);

      this.handlePageHide = this.handlePageHide.bind(this);
    }

    /* ======================================
       EVENT SYSTEM
    ====================================== */

    on(eventName, callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      if (!this.events.has(eventName)) {
        this.events.set(eventName, new Set());
      }

      this.events.get(eventName).add(callback);

      return () => this.off(eventName, callback);
    }

    off(eventName, callback) {
      const listeners = this.events.get(eventName);

      if (!listeners) return;

      listeners.delete(callback);

      if (listeners.size === 0) {
        this.events.delete(eventName);
      }
    }

    emit(eventName, data = {}) {
      const listeners = this.events.get(eventName);

      if (!listeners) return;

      for (const callback of [...listeners]) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Ambient Flow] ${eventName} listener failed:`, error);
        }
      }
    }

    /* ======================================
       VIDEO DISCOVERY
    ====================================== */

    isValidVideo(video) {
      return (
        typeof HTMLVideoElement !== "undefined" &&
        video instanceof HTMLVideoElement &&
        video.isConnected
      );
    }

    isVisible(video) {
      if (!this.isValidVideo(video)) {
        return false;
      }

      const rect = video.getBoundingClientRect();

      const style = window.getComputedStyle(video);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0
      );
    }

    getVideoScore(video) {
      if (!this.isValidVideo(video)) {
        return -1;
      }

      const rect = video.getBoundingClientRect();

      const area = Math.max(0, rect.width * rect.height);

      let score = area;

      const player = video.closest("#movie_player");

      if (player) {
        score += 100000000;
      }

      const shorts = video.closest("ytd-reel-video-renderer, ytd-shorts");

      if (shorts) {
        score += 50000000;
      }

      if (!video.paused && !video.ended) {
        score += 25000000;
      }

      if (this.isVisible(video)) {
        score += 10000000;
      }

      return score;
    }

    findVideo() {
      const selectors = [
        "#movie_player video.html5-main-video",
        "#movie_player video",
        "ytd-shorts video",
        "ytd-reel-video-renderer video",
        "video.html5-main-video",
      ];

      const candidates = new Set();

      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((video) => {
          if (this.isValidVideo(video)) {
            candidates.add(video);
          }
        });
      }

      // Include other videos as a fallback.
      document.querySelectorAll("video").forEach((video) => {
        if (this.isValidVideo(video)) {
          candidates.add(video);
        }
      });

      if (!candidates.size) {
        return null;
      }

      return [...candidates]
        .map((video) => ({
          video,
          score: this.getVideoScore(video),
        }))
        .sort((a, b) => b.score - a.score)[0].video;
    }

    /* ======================================
       VIDEO ATTACHMENT
    ====================================== */

    attachVideo(video) {
      if (!this.isValidVideo(video)) {
        return false;
      }

      if (this.currentVideo === video) {
        return false;
      }

      this.detachVideo();

      this.currentVideo = video;
      this.currentSource = this.getVideoSource(video);

      const events = [
        "play",
        "playing",
        "pause",
        "ended",
        "emptied",
        "waiting",
        "stalled",
        "seeking",
        "seeked",
        "loadedmetadata",
        "loadeddata",
        "canplay",
        "canplaythrough",
        "durationchange",
        "error",
      ];

      for (const eventName of events) {
        video.addEventListener(eventName, this.handleVideoEvent);

        this.videoListeners.push({
          video,
          eventName,
        });
      }

      const state = this.getPlaybackState(video);
      const playing = this.isPlaying(video);

      const data = {
        video,
        hasVideo: true,
        isPlaying: playing,
        isPaused: video.paused,
        state,
        source: this.currentSource,
        url: location.href,
      };

      this.emit("videoDetected", data);

      // Compatibility event for modules listening
      // for videoChanged.
      this.emit("videoChanged", data);

      if (playing) {
        this.emit("videoPlaying", {
          ...data,
          state: "PLAYING",
        });
      }

      console.info(
        "[Ambient Flow] Video detected:",
        video.videoWidth,
        "x",
        video.videoHeight,
        state,
      );

      return true;
    }

    detachVideo() {
      for (const listener of this.videoListeners) {
        listener.video.removeEventListener(
          listener.eventName,
          this.handleVideoEvent,
        );
      }

      this.videoListeners = [];

      if (!this.currentVideo) {
        return;
      }

      const previousVideo = this.currentVideo;

      this.currentVideo = null;
      this.currentSource = "";

      this.emit("videoRemoved", {
        video: previousVideo,
        hasVideo: false,
        isPlaying: false,
        state: "NO_VIDEO",
      });
    }

    /* ======================================
       SOURCE DETECTION
    ====================================== */

    getVideoSource(video = this.currentVideo) {
      if (!video) return "";

      return video.currentSrc || video.src || video.getAttribute("src") || "";
    }

    checkVideoSource() {
      const video = this.currentVideo;

      if (!video || !video.isConnected) {
        return;
      }

      const source = this.getVideoSource(video);

      if (source === this.currentSource) {
        return;
      }

      const previousSource = this.currentSource;

      this.currentSource = source;

      const data = {
        video,
        previousSource,
        source,
        isPlaying: this.isPlaying(video),
        state: this.getPlaybackState(video),
        url: location.href,
      };

      this.emit("videoSourceChanged", data);
      this.emit("videoChanged", data);

      console.info("[Ambient Flow] Video source changed.");
    }

    /* ======================================
       PLAYBACK STATE
    ====================================== */

    isPlaying(video = this.currentVideo) {
      if (!this.isValidVideo(video)) {
        return false;
      }

      // Playback state must not depend on document visibility
      // or frame availability.
      return !video.paused && !video.ended;
    }

    isFrameReady(video = this.currentVideo) {
      if (!this.isValidVideo(video)) {
        return false;
      }

      return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }

    getPlaybackState(video = this.currentVideo) {
      if (!this.isValidVideo(video)) {
        return "NO_VIDEO";
      }

      if (video.error) {
        return "ERROR";
      }

      if (video.ended) {
        return "ENDED";
      }

      if (video.paused) {
        return "PAUSED";
      }

      if (video.seeking) {
        return "SEEKING";
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return "BUFFERING";
      }

      return "PLAYING";
    }

    /* ======================================
       VIDEO EVENTS
    ====================================== */

    handleVideoEvent(event) {
      const video = event.currentTarget;

      if (!video || video !== this.currentVideo) {
        return;
      }

      const state = this.getPlaybackState(video);
      const playing = this.isPlaying(video);

      const data = {
        video,
        event: event.type,
        state,
        isPlaying: playing,
        isPaused: video.paused,
        isEnded: video.ended,
        frameReady: this.isFrameReady(video),
      };

      this.emit("playbackChange", data);

      switch (event.type) {
        case "play":
        case "playing":
        case "seeked":
        case "loadeddata":
        case "canplay":
        case "canplaythrough":
          if (playing) {
            this.emit("videoPlaying", data);
          }
          break;

        case "pause":
          this.emit("videoPaused", data);
          break;

        case "ended":
          this.emit("videoEnded", data);
          break;

        case "waiting":
        case "stalled":
          this.emit("videoBuffering", data);
          break;

        case "emptied":
          this.emit("videoEmptied", data);
          break;

        case "seeking":
          this.emit("videoSeeking", data);
          break;

        case "loadedmetadata":
        case "durationchange":
          this.emit("videoReady", data);
          break;

        case "error":
          this.emit("videoError", {
            ...data,
            error: video.error,
          });
          break;
      }
    }

    /* ======================================
       DOM OBSERVATION
    ====================================== */

    handleMutations() {
      if (!this.running) return;

      this.scheduleScan(150);
    }

    /* ======================================
       YOUTUBE NAVIGATION
    ====================================== */

    handleNavigation() {
      if (!this.running) return;

      const currentUrl = location.href;

      if (currentUrl === this.lastUrl) {
        return;
      }

      const previousUrl = this.lastUrl;

      this.lastUrl = currentUrl;

      this.emit("navigation", {
        previousUrl,
        currentUrl,
      });

      // YouTube replaces player elements asynchronously.
      this.scheduleScan(250);
    }

    installNavigationHooks() {
      window.addEventListener("yt-navigate-finish", this.handleNavigation);

      window.addEventListener("popstate", this.handleNavigation);

      window.addEventListener("pagehide", this.handlePageHide);

      document.addEventListener("visibilitychange", this.handleVisibility);

      this.navigationObserver = new MutationObserver(() => {
        this.handleNavigation();
      });

      if (document.documentElement) {
        this.navigationObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
    }

    removeNavigationHooks() {
      window.removeEventListener("yt-navigate-finish", this.handleNavigation);

      window.removeEventListener("popstate", this.handleNavigation);

      window.removeEventListener("pagehide", this.handlePageHide);

      document.removeEventListener("visibilitychange", this.handleVisibility);

      this.navigationObserver?.disconnect();

      this.navigationObserver = null;
    }

    /* ======================================
       VISIBILITY
    ====================================== */

    handleVisibility() {
      if (!this.currentVideo) return;

      const video = this.currentVideo;

      this.emit("playbackChange", {
        video,
        event: "visibilitychange",
        state: this.getPlaybackState(video),
        isPlaying: this.isPlaying(video),
        isPaused: video.paused,
        isHidden: document.hidden,
      });
    }

    handlePageHide() {
      this.emit("pageHidden", {
        video: this.currentVideo,
        url: location.href,
      });
    }

    /* ======================================
       SCANNING
    ====================================== */

    scan() {
      if (!this.running || this.destroyed) {
        return;
      }

      const detectedVideo = this.findVideo();

      if (detectedVideo !== this.currentVideo) {
        if (detectedVideo) {
          this.attachVideo(detectedVideo);
        } else {
          this.detachVideo();
        }
      }

      if (this.currentVideo) {
        this.checkVideoSource();

        const video = this.currentVideo;

        this.emit("playbackCheck", {
          video,
          hasVideo: true,
          isPlaying: this.isPlaying(video),
          isPaused: video.paused,
          isEnded: video.ended,
          frameReady: this.isFrameReady(video),
          state: this.getPlaybackState(video),
        });
      }
    }

    scheduleScan(delay = 150) {
      if (!this.running) return;

      clearTimeout(this.navigationTimer);

      this.navigationTimer = setTimeout(() => {
        this.navigationTimer = null;
        this.scan();
      }, delay);
    }

    /* ======================================
       START
    ====================================== */

    start() {
      if (this.running || this.destroyed) {
        return;
      }

      this.running = true;
      this.lastUrl = location.href;

      if (document.documentElement) {
        this.observer = new MutationObserver(this.handleMutations);

        this.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }

      this.installNavigationHooks();

      // Detect a video that was already playing
      // before the extension initialized.
      this.scan();

      this.intervalTimer = setInterval(() => {
        this.scan();
      }, this.scanInterval);

      console.info("[Ambient Flow] Video detector started.");
    }

    /* ======================================
       STOP
    ====================================== */

    stop() {
      if (!this.running) return;

      this.running = false;

      clearInterval(this.intervalTimer);
      clearTimeout(this.navigationTimer);

      this.intervalTimer = null;
      this.navigationTimer = null;

      this.observer?.disconnect();
      this.observer = null;

      this.removeNavigationHooks();

      this.detachVideo();

      console.info("[Ambient Flow] Video detector stopped.");
    }

    /* ======================================
       STATUS
    ====================================== */

    getState() {
      const video = this.currentVideo;

      const hasVideo = this.isValidVideo(video);

      const isPlaying = hasVideo ? this.isPlaying(video) : false;

      return {
        running: this.running,
        hasVideo,
        video,
        currentVideo: video,

        isPlaying,
        isPaused: hasVideo ? video.paused : false,
        isEnded: hasVideo ? video.ended : false,

        frameReady: hasVideo ? this.isFrameReady(video) : false,

        playbackState: this.getPlaybackState(video),

        source: hasVideo ? this.getVideoSource(video) : "",

        currentTime: hasVideo ? video.currentTime : 0,

        duration: hasVideo ? video.duration : 0,

        readyState: hasVideo ? video.readyState : 0,

        hidden: document.hidden,
        url: location.href,
      };
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      if (this.destroyed) return;

      this.stop();

      this.events.clear();

      this.destroyed = true;

      console.info("[Ambient Flow] Video detector destroyed.");
    }
  }

  AF.VideoDetector = VideoDetector;

  // Avoid accidentally creating multiple instances.
  if (!AF.videoDetector) {
    AF.videoDetector = new VideoDetector();
  }
})();
