/* ==========================================
   YOUTUBE AMBIENT FLOW
   Dynamic Video Detector
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class VideoDetector {
    constructor() {
      this.currentVideo = null;

      this.observer = null;
      this.navigationObserver = null;

      this.running = false;
      this.destroyed = false;

      this.events = new Map();

      this.scanTimer = null;
      this.scanInterval = 1000;

      this.videoListeners = [];

      this.lastUrl = location.href;

      this.handleVideoEvent = this.handleVideoEvent.bind(this);

      this.handleMutations = this.handleMutations.bind(this);

      this.handleNavigation = this.handleNavigation.bind(this);

      this.handleVisibility = this.handleVisibility.bind(this);
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

      for (const callback of listeners) {
        try {
          callback(data);
        } catch (error) {
          console.error(
            `[Ambient Flow] VideoDetector event error (${eventName}):`,
            error,
          );
        }
      }
    }

    /* ======================================
       VIDEO ELEMENT DISCOVERY
    ====================================== */

    findVideo() {
      const videos = Array.from(document.querySelectorAll("video"));

      if (!videos.length) return null;

      // Prefer the active YouTube player video.
      const preferredSelectors = [
        "#movie_player video",
        "ytd-player video",
        "ytd-reel-video-renderer video",
        "ytd-shorts video",
      ];

      for (const selector of preferredSelectors) {
        const video = document.querySelector(selector);

        if (video instanceof HTMLVideoElement && video.isConnected) {
          return video;
        }
      }

      // Fallback: select the most relevant visible video.
      const candidates = videos
        .filter((video) => {
          if (!video.isConnected) return false;

          const rect = video.getBoundingClientRect();

          return rect.width > 0 && rect.height > 0;
        })
        .sort((a, b) => {
          const aArea =
            a.getBoundingClientRect().width * a.getBoundingClientRect().height;

          const bArea =
            b.getBoundingClientRect().width * b.getBoundingClientRect().height;

          return bArea - aArea;
        });

      return candidates[0] || videos[0] || null;
    }

    /* ======================================
       VIDEO ATTACHMENT
    ====================================== */

    attachVideo(video) {
      if (!video || !(video instanceof HTMLVideoElement)) {
        return false;
      }

      if (this.currentVideo === video) {
        return false;
      }

      this.detachVideo();

      this.currentVideo = video;

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
        "durationchange",
      ];

      for (const eventName of events) {
        video.addEventListener(eventName, this.handleVideoEvent);

        this.videoListeners.push({
          video,
          eventName,
        });
      }

      this.emit("videoDetected", {
        video,
        isPlaying: this.isPlaying(video),
        url: location.href,
      });

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

      if (this.currentVideo) {
        const previousVideo = this.currentVideo;

        this.emit("videoRemoved", {
          video: previousVideo,
        });

        this.currentVideo = null;
      }
    }

    /* ======================================
       PLAYBACK STATE
    ====================================== */

    isPlaying(video = this.currentVideo) {
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

    getPlaybackState(video = this.currentVideo) {
      if (!video) return "NO_VIDEO";

      if (video.ended) return "ENDED";

      if (video.paused) return "PAUSED";

      if (video.seeking) return "SEEKING";

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return "BUFFERING";
      }

      if (document.hidden) return "HIDDEN";

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

      this.emit("playbackChange", {
        video,
        event: event.type,
        state,
        isPlaying: this.isPlaying(video),
      });

      switch (event.type) {
        case "play":
        case "playing":
        case "seeked":
          if (this.isPlaying(video)) {
            this.emit("videoPlaying", {
              video,
              state,
            });
          }
          break;

        case "pause":
          this.emit("videoPaused", {
            video,
            state,
          });
          break;

        case "ended":
          this.emit("videoEnded", {
            video,
            state,
          });
          break;

        case "waiting":
        case "stalled":
          this.emit("videoBuffering", {
            video,
            state,
          });
          break;

        case "emptied":
          this.emit("videoEmptied", {
            video,
            state,
          });
          break;

        case "seeking":
          this.emit("videoSeeking", {
            video,
            state,
          });
          break;

        case "loadedmetadata":
        case "loadeddata":
          this.emit("videoReady", {
            video,
            state,
          });
          break;
      }
    }

    /* ======================================
       DOM CHANGE DETECTION
    ====================================== */

    handleMutations() {
      if (!this.running) return;

      const detectedVideo = this.findVideo();

      if (detectedVideo !== this.currentVideo) {
        if (detectedVideo) {
          this.attachVideo(detectedVideo);
        } else {
          this.detachVideo();
        }

        return;
      }

      // A video may be removed without a replacement.
      if (this.currentVideo && !this.currentVideo.isConnected) {
        this.detachVideo();
      }
    }

    /* ======================================
       YOUTUBE SPA NAVIGATION
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

      // Allow YouTube to create the next player.
      this.scheduleScan(100);
    }

    installNavigationHooks() {
      window.addEventListener("yt-navigate-finish", this.handleNavigation);

      window.addEventListener("popstate", this.handleNavigation);

      window.addEventListener("visibilitychange", this.handleVisibility);

      this.navigationObserver = new MutationObserver(() => {
        this.handleNavigation();
      });

      this.navigationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    removeNavigationHooks() {
      window.removeEventListener("yt-navigate-finish", this.handleNavigation);

      window.removeEventListener("popstate", this.handleNavigation);

      window.removeEventListener("visibilitychange", this.handleVisibility);

      this.navigationObserver?.disconnect();

      this.navigationObserver = null;
    }

    /* ======================================
       VISIBILITY
    ====================================== */

    handleVisibility() {
      if (!this.currentVideo) return;

      this.emit("playbackChange", {
        video: this.currentVideo,
        event: "visibilitychange",
        state: this.getPlaybackState(),
        isPlaying: this.isPlaying(),
      });
    }

    /* ======================================
       SCANNING
    ====================================== */

    scan() {
      if (!this.running) return;

      const video = this.findVideo();

      if (video && video !== this.currentVideo) {
        this.attachVideo(video);
      } else if (!video && this.currentVideo) {
        this.detachVideo();
      }

      // Detect missed state changes.
      if (this.currentVideo) {
        this.emit("playbackCheck", {
          video: this.currentVideo,
          state: this.getPlaybackState(),
          isPlaying: this.isPlaying(),
        });
      }
    }

    scheduleScan(delay = 100) {
      if (!this.running) return;

      clearTimeout(this.scanTimer);

      this.scanTimer = setTimeout(() => {
        this.scan();
      }, delay);
    }

    /* ======================================
       START / STOP
    ====================================== */

    start() {
      if (this.running || this.destroyed) {
        return;
      }

      this.running = true;

      this.lastUrl = location.href;

      this.observer = new MutationObserver(this.handleMutations);

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      this.installNavigationHooks();

      this.scan();

      this.scanTimer = setInterval(() => {
        this.scan();
      }, this.scanInterval);

      console.info("[Ambient Flow] Video detector started.");
    }

    stop() {
      if (!this.running) return;

      this.running = false;

      clearInterval(this.scanTimer);
      clearTimeout(this.scanTimer);

      this.scanTimer = null;

      this.observer?.disconnect();
      this.observer = null;

      this.removeNavigationHooks();

      this.detachVideo();

      console.info("[Ambient Flow] Video detector stopped.");
    }

    /* ======================================
       STATE
    ====================================== */

    getState() {
      return {
        running: this.running,
        video: this.currentVideo,
        currentVideo: this.currentVideo,
        isPlaying: this.isPlaying(),
        playbackState: this.getPlaybackState(),
        url: location.href,
      };
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.stop();

      this.events.clear();

      this.destroyed = true;
    }
  }

  AF.VideoDetector = VideoDetector;
  AF.videoDetector = new VideoDetector();
})();
