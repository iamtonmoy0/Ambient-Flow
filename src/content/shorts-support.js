/**
 * YouTube Ambient Flow
 * Shorts Support
 *
 * Detects YouTube Shorts navigation and active videos.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class ShortsSupport {
    constructor() {
      this.videoDetector = AF.videoDetector || null;
      this.youtubeDetector = AF.youtubeDetector || null;

      this.observer = null;
      this.isRunning = false;
      this.isDestroyed = false;

      this.currentVideo = null;
      this.currentVideoId = null;

      this.listeners = new Map();
      this.unsubscribers = [];

      this.boundMutationHandler = this.handleMutations.bind(this);

      this.boundNavigationHandler = this.handleNavigation.bind(this);

      this.boundVideoChangeHandler = this.handleVideoChange.bind(this);

      this.boundUrlChangeHandler = this.checkPage.bind(this);
    }

    on(event, callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

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
      this.listeners.get(event)?.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error("[AmbientFlow Shorts] Listener error:", error);
        }
      });
    }

    isShortsPage() {
      return window.location.pathname.startsWith("/shorts/");
    }

    getVideoId() {
      if (!this.isShortsPage()) return null;

      const parts = window.location.pathname.split("/");

      return parts[2] || null;
    }

    findShortsRenderer() {
      return (
        document.querySelector("ytd-reel-video-renderer[is-active]") ||
        document.querySelector("ytd-reel-video-renderer")
      );
    }

    findShortsVideo() {
      const renderer = this.findShortsRenderer();

      if (renderer) {
        const video = renderer.querySelector("video");

        if (video instanceof HTMLVideoElement) {
          return video;
        }
      }

      const selectors = [
        "ytd-reel-video-renderer video",
        "ytd-shorts video",
        "#shorts-player video",
        "video.html5-main-video",
      ];

      for (const selector of selectors) {
        const video = document.querySelector(selector);

        if (video instanceof HTMLVideoElement) {
          return video;
        }
      }

      return null;
    }

    handleNavigation() {
      if (!this.isRunning) return;

      this.checkPage();
    }

    handleMutations() {
      if (!this.isRunning) return;

      if (!this.isShortsPage()) {
        if (this.currentVideo) {
          this.clearCurrentVideo();
        }

        return;
      }

      this.detectActiveVideo();
    }

    handleVideoChange(data = {}) {
      if (!this.isRunning || !this.isShortsPage()) {
        return;
      }

      const video = data.video || data.element;

      if (video instanceof HTMLVideoElement && video.isConnected) {
        this.setCurrentVideo(video);
      }
    }

    checkPage() {
      if (!this.isRunning) return;

      if (!this.isShortsPage()) {
        this.clearCurrentVideo();

        this.emit("shortsExited");

        return;
      }

      const videoId = this.getVideoId();

      if (videoId !== this.currentVideoId) {
        this.currentVideoId = videoId;
        this.currentVideo = null;

        this.emit("shortsChanged", {
          videoId,
        });
      }

      this.detectActiveVideo();
    }

    detectActiveVideo() {
      if (!this.isShortsPage()) return;

      const video = this.findShortsVideo();

      if (!video) return;

      this.setCurrentVideo(video);
    }

    setCurrentVideo(video) {
      if (!(video instanceof HTMLVideoElement)) return;

      if (this.currentVideo === video) return;

      this.currentVideo = video;

      const videoId = this.getVideoId();

      this.currentVideoId = videoId;

      this.emit("videoChanged", {
        video,
        videoId,
        paused: video.paused,
        ended: video.ended,
      });

      this.emit("shortsVideoDetected", {
        video,
        videoId,
      });
    }

    clearCurrentVideo() {
      if (!this.currentVideo && !this.currentVideoId) {
        return;
      }

      const previousVideo = this.currentVideo;
      const previousVideoId = this.currentVideoId;

      this.currentVideo = null;
      this.currentVideoId = null;

      this.emit("videoRemoved", {
        video: previousVideo,
        videoId: previousVideoId,
      });
    }

    subscribeToNavigation() {
      if (this.youtubeDetector?.onChange) {
        const unsubscribe = this.youtubeDetector.onChange(
          this.boundNavigationHandler,
        );

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }
      }

      if (this.videoDetector?.on) {
        const unsubscribe = this.videoDetector.on(
          "videoDetected",
          this.boundVideoChangeHandler,
        );

        if (typeof unsubscribe === "function") {
          this.unsubscribers.push(unsubscribe);
        }
      }

      window.addEventListener("popstate", this.boundUrlChangeHandler);

      window.addEventListener("yt-navigate-finish", this.boundUrlChangeHandler);

      window.addEventListener(
        "yt-page-data-updated",
        this.boundUrlChangeHandler,
      );
    }

    unsubscribeFromNavigation() {
      window.removeEventListener("popstate", this.boundUrlChangeHandler);

      window.removeEventListener(
        "yt-navigate-finish",
        this.boundUrlChangeHandler,
      );

      window.removeEventListener(
        "yt-page-data-updated",
        this.boundUrlChangeHandler,
      );

      this.unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn("[AmbientFlow Shorts] Unsubscribe failed:", error);
        }
      });

      this.unsubscribers = [];
    }

    startObserver() {
      if (this.observer || !document.body) return;

      this.observer = new MutationObserver(this.boundMutationHandler);

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["is-active"],
      });
    }

    stopObserver() {
      this.observer?.disconnect();
      this.observer = null;
    }

    start() {
      if (this.isRunning || this.isDestroyed) return;

      this.isRunning = true;

      this.subscribeToNavigation();
      this.startObserver();
      this.checkPage();

      this.emit("started");

      return this;
    }

    stop() {
      if (!this.isRunning) return;

      this.isRunning = false;

      this.stopObserver();
      this.unsubscribeFromNavigation();

      this.clearCurrentVideo();

      this.emit("stopped");
    }

    getStatus() {
      return {
        running: this.isRunning,
        isShorts: this.isShortsPage(),
        videoId: this.currentVideoId,
        videoConnected: Boolean(this.currentVideo?.isConnected),
        paused: this.currentVideo?.paused ?? true,
      };
    }

    destroy() {
      if (this.isDestroyed) return;

      this.stop();

      this.listeners.clear();

      this.currentVideo = null;
      this.currentVideoId = null;

      this.isDestroyed = true;
    }
  }

  AF.ShortsSupport = ShortsSupport;

  AF.shortsSupport = AF.shortsSupport || new ShortsSupport();
})();
