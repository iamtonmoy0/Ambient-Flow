/* ==========================================
   YOUTUBE AMBIENT FLOW
   YouTube Page and Navigation Detector
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class YouTubeDetector {
    constructor() {
      this.running = false;
      this.destroyed = false;

      this.currentUrl = location.href;
      this.currentPage = this.detectPage();

      this.listeners = new Set();

      this.navigationTimer = null;
      this.observer = null;

      this.handleNavigation = this.handleNavigation.bind(this);

      this.handlePopState = this.handlePopState.bind(this);
    }

    /* ======================================
       PAGE DETECTION
    ====================================== */

    detectPage() {
      const url = new URL(location.href);

      const hostname = url.hostname.toLowerCase();
      const pathname = url.pathname;

      if (
        hostname !== "youtube.com" &&
        hostname !== "www.youtube.com" &&
        hostname !== "m.youtube.com"
      ) {
        return {
          type: "EXTERNAL",
          isYouTube: false,
          isVideo: false,
          isShorts: false,
          isPlaylist: false,
          videoId: null,
          playlistId: null,
          url: location.href,
        };
      }

      const isShorts = pathname.startsWith("/shorts/");

      const isWatch = pathname === "/watch";

      const isPlaylist = pathname === "/playlist";

      const isVideo = isWatch || isShorts;

      const videoId = isShorts
        ? pathname.split("/")[2] || null
        : isWatch
          ? url.searchParams.get("v")
          : null;

      const playlistId = url.searchParams.get("list");

      let type = "OTHER";

      if (isShorts) {
        type = "SHORTS";
      } else if (isWatch) {
        type = "WATCH";
      } else if (isPlaylist) {
        type = "PLAYLIST";
      } else if (pathname === "/") {
        type = "HOME";
      } else if (pathname === "/feed/subscriptions") {
        type = "SUBSCRIPTIONS";
      } else if (pathname.startsWith("/results")) {
        type = "SEARCH";
      } else if (pathname.startsWith("/channel/")) {
        type = "CHANNEL";
      } else if (pathname.startsWith("/@")) {
        type = "CHANNEL";
      }

      return {
        type,
        isYouTube: true,
        isVideo,
        isShorts,
        isWatch,
        isPlaylist,
        videoId,
        playlistId,
        url: location.href,
      };
    }

    /* ======================================
       EVENT SUBSCRIPTION
    ====================================== */

    onChange(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    emitChange(previous, current) {
      const event = {
        previous,
        current,
        page: current,
        url: current.url,
        timestamp: Date.now(),
      };

      for (const callback of [...this.listeners]) {
        try {
          callback(event);
        } catch (error) {
          console.error(
            "[Ambient Flow] YouTube navigation listener failed:",
            error,
          );
        }
      }
    }

    /* ======================================
       NAVIGATION HANDLING
    ====================================== */

    handleNavigation() {
      if (!this.running) return;

      clearTimeout(this.navigationTimer);

      this.navigationTimer = setTimeout(() => {
        this.checkPageChange();
      }, 100);
    }

    handlePopState() {
      this.handleNavigation();
    }

    checkPageChange() {
      if (!this.running) return;

      const nextUrl = location.href;

      if (nextUrl === this.currentUrl) {
        return;
      }

      const previousPage = this.currentPage;

      this.currentUrl = nextUrl;
      this.currentPage = this.detectPage();

      this.emitChange(previousPage, this.currentPage);

      console.info(
        "[Ambient Flow] YouTube page changed:",
        this.currentPage.type,
      );
    }

    /* ======================================
       EVENT LISTENERS
    ====================================== */

    installListeners() {
      window.addEventListener("yt-navigate-finish", this.handleNavigation);

      window.addEventListener("yt-page-data-updated", this.handleNavigation);

      window.addEventListener("popstate", this.handlePopState);

      window.addEventListener("hashchange", this.handleNavigation);

      // YouTube occasionally updates its URL or
      // page content without firing navigation events.
      this.observer = new MutationObserver(() => {
        if (location.href !== this.currentUrl) {
          this.handleNavigation();
        }
      });

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    removeListeners() {
      window.removeEventListener("yt-navigate-finish", this.handleNavigation);

      window.removeEventListener("yt-page-data-updated", this.handleNavigation);

      window.removeEventListener("popstate", this.handlePopState);

      window.removeEventListener("hashchange", this.handleNavigation);

      this.observer?.disconnect();
      this.observer = null;

      clearTimeout(this.navigationTimer);
      this.navigationTimer = null;
    }

    /* ======================================
       START
    ====================================== */

    start() {
      if (this.running || this.destroyed) {
        return;
      }

      this.running = true;

      this.currentUrl = location.href;
      this.currentPage = this.detectPage();

      this.installListeners();

      console.info(
        "[Ambient Flow] YouTube detector started:",
        this.currentPage.type,
      );

      this.emitChange(null, this.currentPage);
    }

    /* ======================================
       STOP
    ====================================== */

    stop() {
      if (!this.running) return;

      this.running = false;

      this.removeListeners();

      console.info("[Ambient Flow] YouTube detector stopped.");
    }

    /* ======================================
       PAGE INFORMATION
    ====================================== */

    getPage() {
      return {
        ...this.currentPage,
      };
    }

    isVideoPage() {
      return this.currentPage.isVideo;
    }

    isShortsPage() {
      return this.currentPage.isShorts;
    }

    getVideoId() {
      return this.currentPage.videoId;
    }

    getPlaylistId() {
      return this.currentPage.playlistId;
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.stop();

      this.listeners.clear();

      this.destroyed = true;
    }
  }

  /* ======================================
     GLOBAL INSTANCE
  ====================================== */

  AF.YouTubeDetector = YouTubeDetector;
  AF.youtubeDetector = new YouTubeDetector();
})();
