(() => {
  "use strict";

  const AF = window.AmbientFlow;

  class YouTubeDetector {
    constructor() {
      this.currentUrl = location.href;
      this.currentPage = null;
      this.listeners = new Set();

      this.observer = null;
      this.pollingInterval = null;

      this.handleNavigation = this.handleNavigation.bind(this);
    }

    // Determine current YouTube page type
    getPageType() {
      const path = location.pathname;

      if (/^\/watch/.test(path)) {
        return "watch";
      }

      if (/^\/shorts\//.test(path)) {
        return "shorts";
      }

      if (/^\/results/.test(path)) {
        return "search";
      }

      if (/^\/@[^/]+/.test(path) || /^\/channel\//.test(path)) {
        return "channel";
      }

      if (path === "/" || path === "/feed/trending") {
        return "home";
      }

      if (/^\/playlist/.test(path)) {
        return "playlist";
      }

      return "other";
    }

    // Get current page information
    getState() {
      const pageType = this.getPageType();

      return {
        url: location.href,
        pathname: location.pathname,
        pageType,
        videoId: AF.utils.getVideoId(),
        isWatch: pageType === "watch",
        isShorts: pageType === "shorts",
        isHome: pageType === "home",
        isSearch: pageType === "search",
        isChannel: pageType === "channel",
      };
    }

    // Subscribe to page changes
    onChange(callback) {
      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    // Notify subscribers
    emit(state) {
      this.listeners.forEach((callback) => {
        try {
          callback(state);
        } catch (error) {
          console.error("[AmbientFlow] YouTube detector error:", error);
        }
      });
    }

    // Check for navigation
    handleNavigation() {
      const url = location.href;

      if (url === this.currentUrl) return;

      const previousState = this.getState();

      this.currentUrl = url;

      const state = this.getState();

      this.currentPage = state;

      this.emit({
        ...state,
        previousState,
        navigation: true,
      });
    }

    // Check current page
    check() {
      const state = this.getState();

      this.currentPage = state;

      return state;
    }

    // Start navigation monitoring
    start() {
      if (this.pollingInterval) return;

      this.check();

      window.addEventListener("yt-navigate-finish", this.handleNavigation);

      window.addEventListener("popstate", this.handleNavigation);

      // Fallback for navigation events not detected by YouTube
      this.pollingInterval = setInterval(() => {
        this.handleNavigation();
      }, 1000);

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

    // Stop monitoring
    stop() {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;

      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      window.removeEventListener("yt-navigate-finish", this.handleNavigation);

      window.removeEventListener("popstate", this.handleNavigation);
    }

    // Clean up
    destroy() {
      this.stop();
      this.listeners.clear();
      this.currentPage = null;
    }
  }

  AF.YouTubeDetector = YouTubeDetector;
  AF.youtubeDetector = new YouTubeDetector();
})();
