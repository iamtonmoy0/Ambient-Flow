/* ==========================================
   YOUTUBE AMBIENT FLOW
   Dynamic Theme Engine
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class ThemeEngine {
    constructor() {
      this.root = document.documentElement;

      this.styleId = "ambient-flow-theme";

      this.styleElement = null;

      this.enabled = false;
      this.frozen = false;
      this.frozenColor = null;

      this.currentColor = null;
      this.currentPalette = null;

      this.originalVariables = new Map();
      this.originalAttributes = new Map();

      this.variables = [
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

      this.attributes = ["data-af-enabled", "data-af-performance"];

      this.captureOriginalState();
    }

    /* ======================================
       ORIGINAL PAGE STATE
    ====================================== */

    captureOriginalState() {
      for (const variable of this.variables) {
        this.originalVariables.set(
          variable,
          this.root.style.getPropertyValue(variable),
        );
      }

      for (const attribute of this.attributes) {
        this.originalAttributes.set(
          attribute,
          this.root.getAttribute(attribute),
        );
      }
    }

    restoreOriginalState() {
      for (const variable of this.variables) {
        const original = this.originalVariables.get(variable);

        if (original) {
          this.root.style.setProperty(variable, original);
        } else {
          this.root.style.removeProperty(variable);
        }
      }

      for (const attribute of this.attributes) {
        const original = this.originalAttributes.get(attribute);

        if (original === null || original === undefined) {
          this.root.removeAttribute(attribute);
        } else {
          this.root.setAttribute(attribute, original);
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

      let element = document.getElementById(this.styleId);

      if (!element) {
        element = document.createElement("style");

        element.id = this.styleId;

        element.setAttribute("data-af-generated", "true");

        (document.head || document.documentElement).appendChild(element);
      }

      this.styleElement = element;

      return element;
    }

    /* ======================================
       COLOR VALIDATION
    ====================================== */

    validateColor(color) {
      return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
    }

    /* ======================================
       PALETTE GENERATION
    ====================================== */

    generatePalette(color, settings = {}) {
      if (AF.paletteEngine?.generate) {
        try {
          const generated = AF.paletteEngine.generate(color, settings);

          if (generated) {
            return generated;
          }
        } catch (error) {
          console.warn("[Ambient Flow] Palette engine failed:", error);
        }
      }

      // Safe fallback if PaletteEngine is unavailable.
      return {
        primary: color,
        secondary: color,
        tertiary: color,
        background: "#10151f",
        surface: "#192331",
        text: "#f4f7fc",
        glow: color,
      };
    }

    /* ======================================
       APPLY THEME
    ====================================== */

    apply(color, settings = {}) {
      if (!this.validateColor(color)) {
        return false;
      }

      const effectiveColor =
        this.frozen && this.frozenColor ? this.frozenColor : color;

      const palette = this.generatePalette(effectiveColor, settings);

      return this.applyPalette(palette, settings, effectiveColor);
    }

    applyPalette(palette, settings = {}, sourceColor = null) {
      if (!palette || typeof palette !== "object") {
        return false;
      }

      /*
       * Frozen color is handled here without calling
       * apply() recursively.
       */
      if (this.frozen && this.frozenColor && sourceColor !== this.frozenColor) {
        palette = this.generatePalette(this.frozenColor, settings);

        sourceColor = this.frozenColor;
      }

      const primary =
        palette.primary || palette.dominant || sourceColor || "#243b55";

      const secondary = palette.secondary || primary;

      const tertiary = palette.tertiary || secondary;

      const background = palette.background || "#10151f";

      const surface = palette.surface || "#192331";

      const text = palette.text || "#f4f7fc";

      const glow = palette.glow || primary;

      const intensity =
        Math.max(0, Math.min(100, Number(settings.intensity ?? 45))) / 100;

      const blur = Math.max(0, Math.min(100, Number(settings.blur ?? 54)));

      const transition = Math.max(
        0,
        Math.min(5000, Number(settings.transitionDuration ?? 400)),
      );

      this.root.style.setProperty("--af-primary", primary);

      this.root.style.setProperty("--af-secondary", secondary);

      this.root.style.setProperty("--af-tertiary", tertiary);

      this.root.style.setProperty("--af-background", background);

      this.root.style.setProperty("--af-surface", surface);

      this.root.style.setProperty("--af-text", text);

      this.root.style.setProperty("--af-glow", glow);

      this.root.style.setProperty("--af-intensity", String(intensity));

      this.root.style.setProperty("--af-blur", `${blur}px`);

      this.root.style.setProperty("--af-transition", `${transition}ms`);

      this.root.setAttribute("data-af-enabled", "true");

      if (settings.performanceMode) {
        this.root.setAttribute("data-af-performance", settings.performanceMode);
      } else {
        this.root.removeAttribute("data-af-performance");
      }

      this.updateGeneratedStyles(settings, palette);

      this.currentColor = sourceColor || primary;
      this.currentPalette = palette;
      this.enabled = true;

      return true;
    }

    /* ======================================
       GENERATED PAGE STYLES
    ====================================== */

    updateGeneratedStyles(settings, palette) {
      const element = this.ensureStyleElement();

      const backgroundStyle = settings.backgroundStyle || "gradient";

      let backgroundRule = "";

      if (backgroundStyle === "gradient") {
        backgroundRule = `
          background-image:
            linear-gradient(
              135deg,
              var(--af-background),
              var(--af-tertiary)
            ) !important;
        `;
      } else if (backgroundStyle === "solid") {
        backgroundRule = `
          background-image: none !important;
          background-color: var(--af-background) !important;
        `;
      } else {
        backgroundRule = `
          background-image: none !important;
          background-color: transparent !important;
        `;
      }

      element.textContent = `
        html[data-af-enabled="true"] body,
        html[data-af-enabled="true"] ytd-app {
          ${backgroundRule}
        }

        html[data-af-enabled="true"] #masthead-container,
        html[data-af-enabled="true"] ytd-masthead {
          background-color: var(--af-background) !important;
        }

        html[data-af-enabled="true"] #guide,
        html[data-af-enabled="true"] #guide-content,
        html[data-af-enabled="true"] ytd-mini-guide-renderer {
          background-color: var(--af-background) !important;
        }

        html[data-af-enabled="true"] #secondary,
        html[data-af-enabled="true"] #related,
        html[data-af-enabled="true"] #comments {
          background-color: transparent !important;
        }

        html[data-af-enabled="true"] tp-yt-paper-dialog,
        html[data-af-enabled="true"] ytd-popup-container {
          background-color: var(--af-surface) !important;
        }

        html[data-af-enabled="true"] {
          color-scheme: dark;
        }
      `;
    }

    /* ======================================
       FREEZE COLOR
    ====================================== */

    freeze(color) {
      if (!this.validateColor(color)) {
        return false;
      }

      this.frozen = true;
      this.frozenColor = color;

      return true;
    }

    unfreeze() {
      this.frozen = false;
      this.frozenColor = null;

      return true;
    }

    /* ======================================
       FREEZE STATE
    ====================================== */

    isFrozen() {
      return this.frozen;
    }

    getFrozenColor() {
      return this.frozenColor;
    }

    /* ======================================
       THEME STATE
    ====================================== */

    getStatus() {
      return {
        enabled: this.enabled,
        frozen: this.frozen,
        frozenColor: this.frozenColor,
        currentColor: this.currentColor,
        currentPalette: this.currentPalette,
      };
    }

    /* ======================================
       RESET
    ====================================== */

    reset() {
      if (this.styleElement?.isConnected) {
        this.styleElement.remove();
      }

      this.styleElement = null;

      this.restoreOriginalState();

      this.currentColor = null;
      this.currentPalette = null;

      this.enabled = false;

      /*
       * Do not clear frozen state here.
       * A frozen color should survive a pause
       * and be available when playback resumes.
       */
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.reset();

      this.unfreeze();

      this.enabled = false;
    }
  }

  AF.ThemeEngine = ThemeEngine;
  AF.themeEngine = new ThemeEngine();
})();
