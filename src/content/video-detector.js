/* ==========================================
   YOUTUBE AMBIENT FLOW
   Reliable Video and Playback Detector
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

      this.intervalTimer = null;
      this.navigationTimer = null;

      this.scanInterval = 1000;
      this.lastUrl = location.href;

      this.videoListeners = [];

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

      if (!listeners.size) {
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

    findVideo() {
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

      const videos = [...document.querySelectorAll("video")];

      const visibleVideos = videos
        .filter((video) => {
          if (!video.isConnected) return false;

          const rect = video.getBoundingClientRect();

          return rect.width > 0 && rect.height > 0;
        })
        .sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();

          return rectB.width * rectB.height - rectA.width * rectA.height;
        });

      return visibleVideos[0] || null;
    }

    /* ======================================
       VIDEO ATTACHMENT
    ====================================== */

    attachVideo(video) {
      if (
        !video ||
        !(video instanceof HTMLVideoElement) ||
        !video.isConnected
      ) {
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
        state: this.getPlaybackState(video),
        url: location.href,
      });

      // Catch a video that was already playing
      // before the detector attached its listeners.
      if (this.isPlaying(video)) {
        this.emit("videoPlaying", {
          video,
          state: "PLAYING",
        });
      }

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

      if (!this.currentVideo) return;

      const previousVideo = this.currentVideo;

      this.currentVideo = null;

      this.emit("videoRemoved", {
        video: previousVideo,
      });
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
      if (!video || !video.isConnected) {
        return "NO_VIDEO";
      }

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
      const playing = this.isPlaying(video);

      this.emit("playbackChange", {
        video,
        event: event.type,
        state,
        isPlaying: playing,
      });

      switch (event.type) {
        case "play":
        case "playing":
        case "seeked":
        case "loadeddata":
          if (playing) {
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
        case "durationchange":
          this.emit("videoReady", {
            video,
            state,
          });
          break;
      }
    }

    /* ======================================
       DOM OBSERVATION
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
      }
    }

    /* ======================================
       NAVIGATION
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

      // Give YouTube time to replace its player.
      this.scheduleScan(150);
    }

    installNavigationHooks() {
      window.addEventListener("yt-navigate-finish", this.handleNavigation);

      window.addEventListener("popstate", this.handleNavigation);

      document.addEventListener("visibilitychange", this.handleVisibility);

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

      document.removeEventListener("visibilitychange", this.handleVisibility);

      this.navigationObserver?.disconnect();

      this.navigationObserver = null;
    }

    /* ======================================
       TAB VISIBILITY
    ====================================== */

    handleVisibility() {
      if (!this.currentVideo) return;

      const video = this.currentVideo;

      this.emit("playbackChange", {
        video,
        event: "visibilitychange",
        state: this.getPlaybackState(video),
        isPlaying: this.isPlaying(video),
      });
    }

    /* ======================================
       SCANNING
    ====================================== */

    scan() {
      if (!this.running) return;

      const detectedVideo = this.findVideo();

      if (detectedVideo !== this.currentVideo) {
        if (detectedVideo) {
          this.attachVideo(detectedVideo);
        } else {
          this.detachVideo();
        }
      }

      if (this.currentVideo) {
        this.emit("playbackCheck", {
          video: this.currentVideo,
          state: this.getPlaybackState(),
          isPlaying: this.isPlaying(),
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

      this.observer = new MutationObserver(this.handleMutations);

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      this.installNavigationHooks();

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
