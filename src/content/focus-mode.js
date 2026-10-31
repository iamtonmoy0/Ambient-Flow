(() => {
  "use strict";

  const AF = window.AmbientFlow;

  class FocusMode {
    constructor() {
      this.enabled = false;
      this.hiddenElements = new Map();

      this.styleElement = null;

      this.createStyles();
    }

    // Create focus mode stylesheet
    createStyles() {
      if (document.getElementById("ambient-flow-focus")) {
        this.styleElement = document.getElementById("ambient-flow-focus");

        return;
      }

      this.styleElement = document.createElement("style");
      this.styleElement.id = "ambient-flow-focus";

      (document.head || document.documentElement).appendChild(
        this.styleElement,
      );
    }

    // Apply focus mode CSS
    enable(options = {}) {
      if (this.enabled) return;

      const hideRecommendations = options.hideRecommendations !== false;

      const hideComments = options.hideComments !== false;

      const hideSidebar = options.hideSidebar !== false;

      const hideShorts = options.hideShorts !== false;

      const selectors = [];

      if (hideRecommendations) {
        selectors.push(
          "#secondary",
          "#related",
          "ytd-watch-next-secondary-results-renderer",
        );
      }

      if (hideComments) {
        selectors.push("ytd-comments", "#comments");
      }

      if (hideSidebar) {
        selectors.push("#guide", "ytd-mini-guide-renderer");
      }

      if (hideShorts) {
        selectors.push("ytd-reel-shelf-renderer", "ytd-rich-section-renderer");
      }

      this.styleElement.textContent = `
        ${selectors.join(", ")} {
          display: none !important;
        }

        ytd-watch-flexy[theater]:not([fullscreen]) #primary {
          max-width: 100% !important;
        }

        ytd-watch-flexy #columns {
          max-width: 100% !important;
        }
      `;

      this.enabled = true;

      AF.utils.dispatch("ambientflow:focus", {
        enabled: true,
      });
    }

    // Disable focus mode
    disable() {
      if (!this.enabled) return;

      if (this.styleElement) {
        this.styleElement.textContent = "";
      }

      this.enabled = false;

      AF.utils.dispatch("ambientflow:focus", {
        enabled: false,
      });
    }

    // Toggle focus mode
    toggle(options = {}) {
      if (this.enabled) {
        this.disable();
      } else {
        this.enable(options);
      }

      return this.enabled;
    }

    // Return current state
    isEnabled() {
      return this.enabled;
    }

    // Clean up
    destroy() {
      this.disable();

      if (this.styleElement) {
        this.styleElement.remove();
        this.styleElement = null;
      }

      this.hiddenElements.clear();
    }
  }

  AF.FocusMode = FocusMode;
  AF.focusMode = new FocusMode();
})();
