/**
 * YouTube Ambient Flow
 * Theme Engine
 *
 * Connects palette generation, gradient generation,
 * and YouTube page styling.
 */

(() => {
  "use strict";

  const STYLE_ID = "ambient-flow-theme-generated";

  function getAmbientFlow() {
    const root = typeof window !== "undefined" ? window : globalThis;

    root.AmbientFlow = root.AmbientFlow || {};

    return root.AmbientFlow;
  }

  const ROOT_VARIABLES = [
    "--af-primary",
    "--af-secondary",
    "--af-tertiary",
    "--af-background",
    "--af-surface",
    "--af-text",
    "--af-muted",
    "--af-border",
    "--af-accent",
    "--af-glow",
    "--af-gradient",
  ];

  class ThemeEngine {
    constructor() {
      const AF = getAmbientFlow();

      this.paletteEngine = AF.paletteEngine || null;
      this.gradientEngine = AF.gradientEngine || null;
      this.colorEngine = AF.colorEngine || null;

      this.currentPalette = null;
      this.currentColor = null;
      this.currentGradient = null;

      this.settings = {
        enabled: true,
        ambientGlow: true,
        glowIntensity: 0.65,
        smoothTransitions: true,
        gradientType: "ambient",
        transitionDuration: 500,
      };

      this.isActive = false;
      this.isFrozen = false;
      this.frozenColor = null;
      this.isDestroyed = false;
      this.destroyed = false;

      this.originalVariables = new Map();
      this.originalAttributes = new Map();

      this.styleElement = null;

      this.captureOriginalState();
    }

    captureOriginalState() {
      if (!document.documentElement) return;

      const root = document.documentElement;

      ROOT_VARIABLES.forEach((variable) => {
        this.originalVariables.set(
          variable,
          root.style.getPropertyValue(variable),
        );
      });

      ["data-af-enabled", "data-af-theme", "data-af-gradient"].forEach(
        (attribute) => {
          this.originalAttributes.set(attribute, root.getAttribute(attribute));
        },
      );
    }

    ensureStyleElement() {
      if (this.styleElement?.isConnected) {
        return this.styleElement;
      }

      let style = document.getElementById(STYLE_ID);

      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = this.getGeneratedCSS();

        (document.head || document.documentElement).appendChild(style);
      }

      this.styleElement = style;

      return style;
    }

    getGeneratedCSS() {
      return `
        html[data-af-enabled="true"] {
          --af-transition-duration: 500ms;
        }

        html[data-af-enabled="true"] body {
          background-color: var(--af-background) !important;
          transition:
            background-color var(--af-transition-duration) ease,
            color var(--af-transition-duration) ease;
        }

        html[data-af-enabled="true"] ytd-app {
          background: transparent !important;
        }

        html[data-af-enabled="true"] #content,
        html[data-af-enabled="true"] #page-manager {
          background: transparent !important;
        }

        html[data-af-enabled="true"] #primary,
        html[data-af-enabled="true"] #secondary {
          background: transparent !important;
        }

        html[data-af-enabled="true"] ytd-rich-grid-renderer,
        html[data-af-enabled="true"] ytd-watch-flexy,
        html[data-af-enabled="true"] ytd-browse,
        html[data-af-enabled="true"] ytd-search {
          background: transparent !important;
        }

        html[data-af-enabled="true"] #ambient-flow-theme-background {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background: var(--af-gradient);
          opacity: 1;
          transition:
            opacity var(--af-transition-duration) ease,
            background var(--af-transition-duration) ease;
        }

        html:not([data-af-enabled="true"])
          #ambient-flow-theme-background {
          display: none !important;
        }
      `;
    }

    ensureBackgroundElement() {
      let element = document.getElementById("ambient-flow-theme-background");

      if (!element) {
        element = document.createElement("div");
        element.id = "ambient-flow-theme-background";
        element.setAttribute("aria-hidden", "true");

        document.body?.prepend(element);
      }

      return element;
    }

    normalizeColor(color) {
      if (typeof color === "string") {
        return this.colorEngine?.hexToRgb?.(color) || this.parseColor(color);
      }

      if (
        color &&
        Number.isFinite(Number(color.r)) &&
        Number.isFinite(Number(color.g)) &&
        Number.isFinite(Number(color.b))
      ) {
        return {
          r: Math.max(0, Math.min(255, Number(color.r))),
          g: Math.max(0, Math.min(255, Number(color.g))),
          b: Math.max(0, Math.min(255, Number(color.b))),
        };
      }

      return null;
    }

    parseColor(value) {
      if (typeof value !== "string") return null;

      const match = value.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/,
      );

      if (!match) return null;

      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
      };
    }

    colorToCSS(color, fallback = "#202020") {
      if (typeof color === "string") {
        return color;
      }

      const rgb = this.normalizeColor(color);

      if (!rgb) return fallback;

      return `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
    }

    getPalette(color) {
      if (this.paletteEngine?.createPalette) {
        try {
          return this.paletteEngine.createPalette(color, this.settings);
        } catch (error) {
          console.warn("[AmbientFlow] Palette generation failed:", error);
        }
      }

      const normalized = this.normalizeColor(color);

      if (!normalized) return null;

      const hex = this.colorEngine?.rgbToHex?.(normalized) || "#202020";

      return {
        primary: hex,
        secondary: "#181818",
        tertiary: "#242424",
        background: "#101010",
        surface: "#202020",
        text: "#ffffff",
        muted: "#aaaaaa",
        border: "#333333",
        accent: hex,
        glow: hex,
        raw: normalized,
      };
    }

    getGradient(color, palette) {
      if (this.gradientEngine?.create) {
        try {
          return this.gradientEngine.create(color, {
            type: this.settings.gradientType,
            intensity: this.settings.glowIntensity,
          });
        } catch (error) {
          console.warn("[AmbientFlow] Gradient generation failed:", error);
        }
      }

      const primary = this.colorToCSS(palette?.primary, "#202020");

      return `
        radial-gradient(
          ellipse at 50% 0%,
          ${primary}55 0%,
          transparent 70%
        )
      `;
    }

    applyPalette(palette, gradient) {
      if (!palette || !document.documentElement) {
        return false;
      }

      const root = document.documentElement;

      const variables = {
        "--af-primary": palette.primary,
        "--af-secondary": palette.secondary,
        "--af-tertiary": palette.tertiary,
        "--af-background": palette.background,
        "--af-surface": palette.surface,
        "--af-text": palette.text,
        "--af-muted": palette.muted,
        "--af-border": palette.border,
        "--af-accent": palette.accent,
        "--af-glow": palette.glow,
        "--af-gradient": gradient,
      };

      Object.entries(variables).forEach(([name, value]) => {
        if (value === undefined || value === null) return;

        root.style.setProperty(name, String(value));
      });

      const duration = this.settings.smoothTransitions
        ? this.settings.transitionDuration
        : 0;

      root.style.setProperty("--af-transition-duration", `${duration}ms`);

      root.setAttribute("data-af-enabled", "true");
      root.setAttribute("data-af-theme", "ambient");
      root.setAttribute("data-af-gradient", this.settings.gradientType);

      this.ensureStyleElement();
      this.ensureBackgroundElement();

      return true;
    }

    applyColor(color, options = {}) {
      if (this.destroyed || !this.settings.enabled || this.isFrozen) {
        return false;
      }

      const normalized = this.normalizeColor(color);

      if (!normalized) {
        console.warn("[AmbientFlow] Invalid color received:", color);

        return false;
      }

      const palette = this.getPalette(normalized);

      if (!palette) return false;

      const gradient = this.getGradient(normalized, palette);

      if (!gradient) return false;

      const applied = this.applyPalette(palette, gradient);

      if (!applied) return false;

      this.currentColor = normalized;
      this.currentPalette = palette;
      this.currentGradient = gradient;
      this.isActive = true;

      if (options.sceneChanged) {
        this.emitSceneUpdate(palette);
      }

      return true;
    }

    apply(color, options = {}) {
      return this.applyColor(color, options);
    }

    emitSceneUpdate(palette) {
      document.dispatchEvent(
        new CustomEvent("ambient-flow:scene-changed", {
          detail: {
            palette,
          },
        }),
      );
    }

    setSettings(settings = {}) {
      if (!settings || typeof settings !== "object") {
        return false;
      }

      this.settings = {
        ...this.settings,
        ...settings,
      };

      if (this.currentColor && !this.isFrozen && this.settings.enabled) {
        this.applyColor(this.currentColor);
      }

      return true;
    }

    setEnabled(enabled) {
      this.settings.enabled = Boolean(enabled);

      if (!this.settings.enabled) {
        this.reset();
      } else if (this.currentColor && !this.isFrozen) {
        this.applyColor(this.currentColor);
      }
    }

    freeze(color) {
      this.isFrozen = true;

      if (color) {
        this.frozenColor = color;

        const normalized = this.normalizeColor(color);

        if (normalized) {
          const previous = this.isFrozen;

          this.isFrozen = false;
          this.applyColor(normalized);
          this.isFrozen = previous;
        }
      }

      return true;
    }

    unfreeze() {
      this.isFrozen = false;
      this.frozenColor = null;
    }

    reset() {
      if (!document.documentElement) return;

      const root = document.documentElement;

      ROOT_VARIABLES.forEach((variable) => {
        const original = this.originalVariables.get(variable);

        if (original) {
          root.style.setProperty(variable, original);
        } else {
          root.style.removeProperty(variable);
        }
      });

      this.originalAttributes.forEach((value, attribute) => {
        if (value === null) {
          root.removeAttribute(attribute);
        } else {
          root.setAttribute(attribute, value);
        }
      });

      document.getElementById("ambient-flow-theme-background")?.remove();

      this.currentPalette = null;
      this.currentColor = null;
      this.currentGradient = null;
      this.isActive = false;

      this.paletteEngine?.reset?.();
      this.gradientEngine?.reset?.();
    }

    getStatus() {
      return {
        active: this.isActive,
        frozen: this.isFrozen,
        enabled: this.settings.enabled,
        color: this.currentColor,
        palette: this.currentPalette,
        gradient: this.currentGradient,
      };
    }

    destroy() {
      if (this.destroyed) return;

      this.reset();

      this.styleElement?.remove();
      this.styleElement = null;

      this.destroyed = true;
      this.isDestroyed = true;
    }
  }

  const AF = getAmbientFlow();

  AF.ThemeEngine = ThemeEngine;

  AF.themeEngine = AF.themeEngine || new ThemeEngine();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ThemeEngine };
  }
})();
