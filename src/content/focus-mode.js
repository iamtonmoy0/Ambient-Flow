/**
 * YouTube Ambient Flow
 * Focus Mode
 *
 * Hides selected YouTube interface elements without removing them.
 * Restores the original appearance when Focus Mode is disabled.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class FocusMode {
    constructor() {
      this.enabled = false;
      this.styleElement = null;
      this.settings = {
        hideSidebar: true,
        hideComments: false,
        hideRecommendations: false,
        hideChat: true,
        hideHeader: false,
        hideShortsSidebar: false,
      };
    }

    createStyleElement() {
      if (this.styleElement?.isConnected) {
        return this.styleElement;
      }

      const style = document.createElement("style");
      style.id = "ambient-flow-focus-style";
      style.textContent = this.getFocusCSS();

      (document.head || document.documentElement).appendChild(style);

      this.styleElement = style;

      return style;
    }

    getFocusCSS() {
      return `
        /* Focus Mode is activated only when this attribute exists. */

        html[data-af-focus="true"] {
          --af-focus-transition: 180ms ease;
        }

        html[data-af-focus="true"] ytd-watch-flexy {
          transition: width var(--af-focus-transition);
        }

        /* Sidebar */
        html[data-af-focus="true"][data-af-hide-sidebar="true"]
        #guide,
        html[data-af-focus="true"][data-af-hide-sidebar="true"]
        ytd-mini-guide-renderer,
        html[data-af-focus="true"][data-af-hide-sidebar="true"]
        #secondary {
          display: none !important;
        }

        /* Recommendations */
        html[data-af-focus="true"][data-af-hide-recommendations="true"]
        #related,
        html[data-af-focus="true"][data-af-hide-recommendations="true"]
        ytd-watch-next-secondary-results-renderer {
          display: none !important;
        }

        /* Comments */
        html[data-af-focus="true"][data-af-hide-comments="true"]
        #comments,
        html[data-af-focus="true"][data-af-hide-comments="true"]
        ytd-comments {
          display: none !important;
        }

        /* Live chat */
        html[data-af-focus="true"][data-af-hide-chat="true"]
        #chat,
        html[data-af-focus="true"][data-af-hide-chat="true"]
        ytd-live-chat-frame,
        html[data-af-focus="true"][data-af-hide-chat="true"]
        #chat-container {
          display: none !important;
        }

        /* Header */
        html[data-af-focus="true"][data-af-hide-header="true"]
        ytd-masthead {
          display: none !important;
        }

        /* Shorts navigation and side panels */
        html[data-af-focus="true"][data-af-hide-shorts-sidebar="true"]
        ytd-reel-video-renderer #actions,
        html[data-af-focus="true"][data-af-hide-shorts-sidebar="true"]
        ytd-shorts #actions,
        html[data-af-focus="true"][data-af-hide-shorts-sidebar="true"]
        ytd-reel-video-renderer #shorts-container + #actions {
          display: none !important;
        }

        /* Expand the main video area when the sidebar is hidden. */
        html[data-af-focus="true"][data-af-hide-sidebar="true"]
        ytd-watch-flexy[flexy] #primary {
          max-width: 100% !important;
          width: 100% !important;
        }

        html[data-af-focus="true"][data-af-hide-sidebar="true"]
        ytd-watch-flexy[flexy] #columns {
          justify-content: center !important;
        }

        @media (max-width: 768px) {
          html[data-af-focus="true"][data-af-hide-sidebar="true"]
          #primary {
            width: 100% !important;
          }
        }
      `;
    }

    applyAttributes() {
      const root = document.documentElement;

      if (!root) {
        return;
      }

      root.setAttribute("data-af-focus", "true");

      root.setAttribute(
        "data-af-hide-sidebar",
        String(this.settings.hideSidebar),
      );

      root.setAttribute(
        "data-af-hide-comments",
        String(this.settings.hideComments),
      );

      root.setAttribute(
        "data-af-hide-recommendations",
        String(this.settings.hideRecommendations),
      );

      root.setAttribute("data-af-hide-chat", String(this.settings.hideChat));

      root.setAttribute(
        "data-af-hide-header",
        String(this.settings.hideHeader),
      );

      root.setAttribute(
        "data-af-hide-shorts-sidebar",
        String(this.settings.hideShortsSidebar),
      );
    }

    enable(options = {}) {
      this.settings = {
        ...this.settings,
        ...options,
      };

      this.createStyleElement();
      this.applyAttributes();

      this.enabled = true;

      console.info("[Ambient Flow] Focus Mode enabled.");

      return true;
    }

    disable() {
      const root = document.documentElement;

      if (root) {
        const attributes = [
          "data-af-focus",
          "data-af-hide-sidebar",
          "data-af-hide-comments",
          "data-af-hide-recommendations",
          "data-af-hide-chat",
          "data-af-hide-header",
          "data-af-hide-shorts-sidebar",
        ];

        attributes.forEach((attribute) => {
          root.removeAttribute(attribute);
        });
      }

      this.enabled = false;

      console.info("[Ambient Flow] Focus Mode disabled.");

      return true;
    }

    toggle(options = {}) {
      if (this.enabled) {
        return this.disable();
      }

      return this.enable(options);
    }

    updateSettings(options = {}) {
      this.settings = {
        ...this.settings,
        ...options,
      };

      if (this.enabled) {
        this.applyAttributes();
      }

      return this.getStatus();
    }

    setOption(option, value) {
      if (!Object.prototype.hasOwnProperty.call(this.settings, option)) {
        return false;
      }

      this.settings[option] = Boolean(value);

      if (this.enabled) {
        this.applyAttributes();
      }

      return true;
    }

    getStatus() {
      return {
        enabled: this.enabled,
        settings: { ...this.settings },
      };
    }

    destroy() {
      this.disable();

      if (this.styleElement) {
        this.styleElement.remove();
        this.styleElement = null;
      }

      console.info("[Ambient Flow] Focus Mode destroyed.");
    }
  }

  AF.FocusMode = FocusMode;
  AF.focusMode = AF.focusMode || new FocusMode();
})();
