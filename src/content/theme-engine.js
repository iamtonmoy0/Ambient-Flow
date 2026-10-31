/* ==========================================
   YOUTUBE AMBIENT FLOW
   Playback-Aware Theme Engine
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class ThemeEngine {
    constructor() {
      this.styleId = "ambient-flow-theme";

      this.root = document.documentElement;

      this.styleElement = null;

      this.currentColor = null;
      this.currentPalette = null;

      this.enabled = false;
      this.frozen = false;
      this.frozenColor = null;

      this.originalVariables = null;
      this.originalAttributes = null;

      this.transitionTimer = null;

      this.variableNames = [
        "--af-primary",
        "--af-secondary",
        "--af-tertiary",
        "--af-background",
        "--af-text",
        "--af-surface",
        "--af-glow",
        "--af-intensity",
        "--af-blur",
        "--af-transition",
      ];

      this.attributeNames = ["data-af-enabled", "data-af-performance"];

      this.captureOriginalStyles();
    }

    /* ======================================
       ORIGINAL STYLE PRESERVATION
    ====================================== */

    captureOriginalStyles() {
      if (this.originalVariables) return;

      this.originalVariables = {};

      for (const name of this.variableNames) {
        this.originalVariables[name] = this.root.style.getPropertyValue(name);
      }

      this.originalAttributes = {};

      for (const name of this.attributeNames) {
        this.originalAttributes[name] = this.root.hasAttribute(name)
          ? this.root.getAttribute(name)
          : null;
      }
    }

    restoreOriginalVariables() {
      for (const name of this.variableNames) {
        const original = this.originalVariables[name];

        if (original) {
          this.root.style.setProperty(name, original);
        } else {
          this.root.style.removeProperty(name);
        }
      }
    }

    restoreOriginalAttributes() {
      for (const name of this.attributeNames) {
        const original = this.originalAttributes[name];

        if (original === null) {
          this.root.removeAttribute(name);
        } else {
          this.root.setAttribute(name, original);
        }
      }
    }

    /* ======================================
       STYLE ELEMENT
    ====================================== */

    ensureStyleElement() {
      if (this.styleElement && this.styleElement.isConnected) {
        return this.styleElement;
      }

      let existing = document.getElementById(this.styleId);

      if (!existing) {
        existing = document.createElement("style");

        existing.id = this.styleId;

        (document.head || this.root).appendChild(existing);
      }

      this.styleElement = existing;

      return this.styleElement;
    }

    /* ======================================
       PALETTE APPLICATION
    ====================================== */

    apply(color, settings = {}) {
      if (!color) return false;

      if (settings.enabled === false) {
        this.reset();
        return false;
      }

      if (this.frozen && this.frozenColor) {
        color = this.frozenColor;
      }

      const palette = AF.paletteEngine.generate(color, settings);

      return this.applyPalette(palette, settings);
    }

    applyPalette(palette, settings = {}) {
      if (!palette || settings.enabled === false) {
        this.reset();
        return false;
      }

      if (this.frozen && this.frozenColor) {
        return this.apply(this.frozenColor, {
          ...settings,
          enabled: true,
        });
      }

      this.captureOriginalStyles();

      this.currentPalette = palette;

      this.currentColor = palette.primary || palette.background || null;

      this.enabled = true;

      const variables = AF.paletteEngine.toCSSVariables(palette);

      for (const [name, value] of Object.entries(variables)) {
        this.root.style.setProperty(name, value);
      }

      this.root.setAttribute("data-af-enabled", "true");

      this.root.setAttribute(
        "data-af-performance",
        settings.performanceMode || "balanced",
      );

      const style = this.ensureStyleElement();

      const transition = Math.max(0, Number(settings.transitionMs ?? 900));

      const intensity =
        Math.max(
          0,
          Math.min(100, Number(settings.intensity ?? palette.intensity ?? 68)),
        ) / 100;

      const backgroundStyle = settings.backgroundStyle || "gradient";

      let backgroundRule = "";

      if (backgroundStyle === "solid") {
        backgroundRule = `
          background-color: var(--af-background) !important;
        `;
      } else if (backgroundStyle === "gradient") {
        backgroundRule = `
          background-image:
            linear-gradient(
              135deg,
              color-mix(in srgb, var(--af-background) 94%, var(--af-primary) 6%),
              var(--af-background)
            ) !important;
          background-color: var(--af-background) !important;
        `;
      }

      style.textContent = `
        :root {
          --af-transition: ${transition}ms;
          --af-intensity: ${intensity};
        }

        html[data-af-enabled="true"],
        html[data-af-enabled="true"] body,
        html[data-af-enabled="true"] ytd-app {
          ${backgroundRule}
          color: var(--af-text);
          transition:
            background-color ${transition}ms ease,
            color ${transition}ms ease;
        }

        html[data-af-enabled="true"] #content,
        html[data-af-enabled="true"] #page-manager,
        html[data-af-enabled="true"] #columns,
        html[data-af-enabled="true"] #primary,
        html[data-af-enabled="true"] #secondary {
          background-color: transparent;
        }

        html[data-af-enabled="true"] #masthead-container,
        html[data-af-enabled="true"] ytd-masthead {
          background-color: var(--af-background);
        }

        html[data-af-enabled="true"] ytd-rich-item-renderer:hover,
        html[data-af-enabled="true"] ytd-video-renderer:hover,
        html[data-af-enabled="true"] ytd-compact-video-renderer:hover,
        html[data-af-enabled="true"] ytd-comment-thread-renderer:hover {
          background-color: var(--af-surface);
        }

        html[data-af-enabled="true"] #video-title,
        html[data-af-enabled="true"] #video-title-link {
          color: var(--af-text);
        }

        html[data-af-enabled="true"] #ambient-flow-glow {
          opacity: ${intensity};
        }
      `;

      this.scheduleTransitionCleanup(transition);

      return true;
    }

    /* ======================================
       TRANSITION MANAGEMENT
    ====================================== */

    scheduleTransitionCleanup(duration) {
      if (this.transitionTimer) {
        clearTimeout(this.transitionTimer);
      }

      this.transitionTimer = setTimeout(() => {
        this.transitionTimer = null;
      }, duration + 100);
    }

    /* ======================================
       FREEZE BACKGROUND
    ====================================== */

    freeze(color = this.currentColor) {
      if (!color) return false;

      this.frozen = true;
      this.frozenColor = color;

      return true;
    }

    unfreeze() {
      this.frozen = false;
      this.frozenColor = null;
    }

    /* ======================================
       RESTORE ORIGINAL YOUTUBE
    ====================================== */

    reset() {
      this.enabled = false;

      this.currentColor = null;
      this.currentPalette = null;

      if (this.transitionTimer) {
        clearTimeout(this.transitionTimer);
        this.transitionTimer = null;
      }

      // Remove generated theme CSS.
      const style = document.getElementById(this.styleId);

      if (style) {
        style.remove();
      }

      this.styleElement = null;

      // Restore original inline CSS variables.
      this.restoreOriginalVariables();

      // Restore original extension-related attributes.
      this.restoreOriginalAttributes();
    }

    /* ======================================
       STATUS
    ====================================== */

    getStatus() {
      return {
        enabled: this.enabled,
        frozen: this.frozen,
        currentColor: this.currentColor,
        currentPalette: this.currentPalette,
      };
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.reset();

      this.frozen = false;
      this.frozenColor = null;
    }
  }

  AF.ThemeEngine = ThemeEngine;
  AF.themeEngine = new ThemeEngine();
})();
