/**
 * YouTube Ambient Flow
 * Shorts Support
 *
 * Detects YouTube Shorts pages and tracks the active Shorts video.
 * VideoDetector remains responsible for playback events and video detection.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class ShortsSupport {
    constructor() {
      this.enabled = true;
      this.started = false;
      this.active = false;

      this.currentVideo = null;
      this.currentVideoId = null;

      this.observer = null;
      this.routeTimer = null;
      this.syncTimer = null;

      this.unsubscribers = [];
      this.listeners = new Set();

      this.boundVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    onChange(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    emit(eventName, details = {}) {
      const event = {
        type: eventName,
        isShorts: this.active,
        video: this.currentVideo,
        videoId: this.currentVideoId,
        timestamp: Date.now(),
        ...details,
      };

      this.listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error("[Ambient Flow] Shorts listener error:", error);
        }
      });
    }

    isShortsPage() {
      return (
        window.location.pathname.startsWith("/shorts/") ||
        Boolean(document.querySelector("ytd-reel-video-renderer"))
      );
    }

    getVideoId() {
      const match = window.location.pathname.match(/^\/shorts\/([^/?#]+)/);

      return match ? match[1] : null;
    }

    findShortsVideo() {
      const selectors = [
        "ytd-reel-video-renderer[is-active] video",
        'ytd-reel-video-renderer[aria-hidden="false"] video',
        "ytd-shorts video",
        "#shorts-container video",
        "ytd-reel-video-renderer video",
      ];

      for (const selector of selectors) {
        const videos = document.querySelectorAll(selector);

        for (const video of videos) {
          if (
            video instanceof HTMLVideoElement &&
            video.isConnected &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            return video;
          }
        }
      }

      // Use the shared detector as a fallback.
      const detectedVideo = AF.videoDetector?.currentVideo;

      if (
        detectedVideo instanceof HTMLVideoElement &&
        detectedVideo.isConnected
      ) {
        return detectedVideo;
      }

      return null;
    }

    updatePage() {
      if (!this.enabled || !this.started) {
        return;
      }

      const isShorts = this.isShortsPage();
      const videoId = isShorts ? this.getVideoId() : null;

      if (isShorts !== this.active) {
        this.active = isShorts;
        this.currentVideo = null;
        this.currentVideoId = videoId;

        this.emit(isShorts ? "shortsEntered" : "shortsExited", {
          videoId,
        });

        if (isShorts) {
          this.startObserver();
          this.syncVideo();
        } else {
          this.stopObserver();
        }

        return;
      }

      if (isShorts && videoId !== this.currentVideoId) {
        this.currentVideoId = videoId;
        this.currentVideo = null;

        this.emit("shortsVideoChanged", {
          videoId,
        });

        this.syncVideo();
      }

      if (isShorts) {
        this.syncVideo();
      }
    }

    syncVideo() {
      if (!this.active || !this.enabled || !this.started) {
        return;
      }

      const video = this.findShortsVideo();

      if (!video || video === this.currentVideo) {
        return;
      }

      const previousVideo = this.currentVideo;
      this.currentVideo = video;

      this.emit("activeVideoChanged", {
        video,
        previousVideo,
        videoId: this.currentVideoId,
        isPlaying: !video.paused && !video.ended,
      });
    }

    scheduleSync(delay = 150) {
      if (this.syncTimer) {
        clearTimeout(this.syncTimer);
      }

      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        this.syncVideo();
      }, delay);
    }

    startObserver() {
      if (this.observer || !document.body) {
        return;
      }

      this.observer = new MutationObserver(() => {
        this.scheduleSync();
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["is-active", "aria-hidden"],
      });
    }

    stopObserver() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      if (this.syncTimer) {
        clearTimeout(this.syncTimer);
        this.syncTimer = null;
      }
    }

    handleNavigation() {
      if (!this.started) {
        return;
      }

      if (this.routeTimer) {
        clearTimeout(this.routeTimer);
      }

      this.routeTimer = setTimeout(() => {
        this.routeTimer = null;
        this.updatePage();
      }, 100);
    }

    handleVisibilityChange() {
      if (!document.hidden && this.active) {
        this.scheduleSync(100);
      }
    }

    subscribeToNavigation() {
      const youtubeDetector = AF.youtubeDetector;

      if (youtubeDetector?.onChange) {
        const unsubscribe = youtubeDetector.onChange(() => {
          this.handleNavigation();
        });

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }
      }

      const videoDetector = AF.videoDetector;

      if (videoDetector?.on) {
        const unsubscribe = videoDetector.on("videoDetected", () => {
          this.scheduleSync(100);
        });

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }

        const navigationUnsubscribe = videoDetector.on("navigation", () => {
          this.handleNavigation();
        });

        if (typeof navigationUnsubscribe === "function") {
          this.unsubscribers.push(navigationUnsubscribe);
        }
      }

      window.addEventListener(
        "yt-navigate-finish",
        this.handleNavigation.bind(this),
      );

      window.addEventListener("popstate", this.handleNavigation.bind(this));

      document.addEventListener("visibilitychange", this.boundVisibilityChange);
    }

    start() {
      if (this.started) {
        return;
      }

      this.started = true;
      this.subscribeToNavigation();
      this.updatePage();

      console.info("[Ambient Flow] Shorts support started.");
    }

    stop() {
      if (!this.started) {
        return;
      }

      this.started = false;

      this.stopObserver();

      if (this.routeTimer) {
        clearTimeout(this.routeTimer);
        this.routeTimer = null;
      }

      this.unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn(
            "[Ambient Flow] Could not remove Shorts listener:",
            error,
          );
        }
      });

      this.unsubscribers = [];

      window.removeEventListener("yt-navigate-finish", this.handleNavigation);

      window.removeEventListener("popstate", this.handleNavigation);

      document.removeEventListener(
        "visibilitychange",
        this.boundVisibilityChange,
      );

      this.currentVideo = null;
      this.currentVideoId = null;
      this.active = false;

      this.emit("stopped");

      console.info("[Ambient Flow] Shorts support stopped.");
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);

      if (!this.enabled) {
        this.stopObserver();
        this.currentVideo = null;
        this.currentVideoId = null;
        this.active = false;
        this.emit("disabled");
        return;
      }

      if (this.started) {
        this.updatePage();
      }
    }

    isActive() {
      return this.active;
    }

    getCurrentVideo() {
      return this.currentVideo;
    }

    getStatus() {
      return {
        enabled: this.enabled,
        started: this.started,
        isShorts: this.active,
        videoId: this.currentVideoId,
        hasVideo: Boolean(this.currentVideo),
        isPlaying: Boolean(
          this.currentVideo &&
          !this.currentVideo.paused &&
          !this.currentVideo.ended,
        ),
      };
    }

    destroy() {
      this.stop();
      this.listeners.clear();
    }
  }

  AF.ShortsSupport = ShortsSupport;
  AF.shortsSupport = AF.shortsSupport || new ShortsSupport();
})();
