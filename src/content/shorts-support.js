(() => {
  "use strict";

  class ShortsSupport {
    constructor() {
      this.enabled = true;
      this.activeVideo = null;
      this.activeShortId = null;
      this.observer = null;
      this.scrollTimer = null;
      this.listeners = new Set();

      this.handleScroll = this.handleScroll.bind(this);
      this.handleMutations = this.handleMutations.bind(this);
    }

    // Check whether the current page is Shorts
    isShortsPage() {
      return /^\/shorts\/[^/]+/.test(location.pathname);
    }

    // Extract current Short ID
    getShortId() {
      if (!this.isShortsPage()) return null;

      return location.pathname.split("/shorts/")[1]?.split("/")[0] || null;
    }

    // Find active Shorts video
    findActiveVideo() {
      const videos = Array.from(document.querySelectorAll("video"));

      if (!videos.length) return null;

      const visibleVideos = videos
        .map((video) => {
          const rect = video.getBoundingClientRect();

          const visibleWidth = Math.max(
            0,
            Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
          );

          const visibleHeight = Math.max(
            0,
            Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
          );

          return {
            video,
            visibleArea: visibleWidth * visibleHeight,
            playing: !video.paused,
          };
        })
        .filter((item) => item.visibleArea > 0);

      visibleVideos.sort((a, b) => {
        if (a.playing !== b.playing) {
          return Number(b.playing) - Number(a.playing);
        }

        return b.visibleArea - a.visibleArea;
      });

      return visibleVideos[0]?.video || null;
    }

    // Subscribe to Shorts changes
    onChange(callback) {
      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    // Notify subscribers
    emit(data) {
      this.listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error("[AmbientFlow] Shorts listener error:", error);
        }
      });
    }

    // Detect active Short changes
    check() {
      if (!this.enabled || !this.isShortsPage()) {
        return;
      }

      const video = this.findActiveVideo();
      const shortId = this.getShortId();

      if (video === this.activeVideo && shortId === this.activeShortId) {
        return;
      }

      this.activeVideo = video;
      this.activeShortId = shortId;

      this.emit({
        video,
        shortId,
        isShorts: true,
      });
    }

    // Handle scroll events
    handleScroll() {
      clearTimeout(this.scrollTimer);

      this.scrollTimer = setTimeout(() => {
        this.check();
      }, 150);
    }

    // Handle DOM changes
    handleMutations() {
      this.check();
    }

    // Start Shorts monitoring
    start() {
      if (!this.enabled || this.observer) return;

      if (!this.isShortsPage()) return;

      this.check();

      this.observer = new MutationObserver(this.handleMutations);

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      window.addEventListener("scroll", this.handleScroll, { passive: true });

      window.addEventListener("resize", this.handleScroll, { passive: true });
    }

    // Stop monitoring
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      window.removeEventListener("scroll", this.handleScroll);

      window.removeEventListener("resize", this.handleScroll);

      clearTimeout(this.scrollTimer);

      this.activeVideo = null;
      this.activeShortId = null;
    }

    // Enable or disable Shorts support
    setEnabled(enabled) {
      this.enabled = Boolean(enabled);

      if (this.enabled) {
        this.start();
      } else {
        this.stop();
      }
    }

    // Return current Shorts state
    getState() {
      return {
        enabled: this.enabled,
        isShorts: this.isShortsPage(),
        shortId: this.activeShortId,
        video: this.activeVideo,
      };
    }

    destroy() {
      this.stop();
      this.listeners.clear();
      this.enabled = false;
    }
  }

  window.AmbientFlow.ShortsSupport = ShortsSupport;

  window.AmbientFlow.shortsSupport = new ShortsSupport();
})();
