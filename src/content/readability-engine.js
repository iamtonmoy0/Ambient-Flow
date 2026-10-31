/**
 * YouTube Ambient Flow
 * Readability Engine
 *
 * Ensures readable text colors against dynamic backgrounds.
 * Uses WCAG relative luminance and contrast calculations.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class ReadabilityEngine {
    constructor() {
      this.colorEngine = AF.colorEngine || null;

      this.minimumContrast = 4.5;
      this.largeTextContrast = 3;
      this.enhancedContrast = 7;

      this.originalVariables = new Map();

      this.isActive = false;
      this.isDestroyed = false;
    }

    normalize(color) {
      if (this.colorEngine?.normalize) {
        return this.colorEngine.normalize(color);
      }

      if (typeof color === "string") {
        return this.hexToRgb(color);
      }

      if (
        !color ||
        !Number.isFinite(Number(color.r)) ||
        !Number.isFinite(Number(color.g)) ||
        !Number.isFinite(Number(color.b))
      ) {
        return null;
      }

      return {
        r: this.clamp(color.r),
        g: this.clamp(color.g),
        b: this.clamp(color.b),
      };
    }

    clamp(value) {
      return Math.max(0, Math.min(255, Number(value)));
    }

    hexToRgb(hex) {
      if (typeof hex !== "string") return null;

      let value = hex.trim().replace(/^#/, "");

      if (/^[a-f\d]{3}$/i.test(value)) {
        value = value
          .split("")
          .map((character) => character + character)
          .join("");
      }

      if (!/^[a-f\d]{6}$/i.test(value)) return null;

      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
      };
    }

    toHex(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const channel = (value) =>
        Math.round(value).toString(16).padStart(2, "0");

      return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
    }

    relativeLuminance(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const linearize = (value) => {
        const channel = value / 255;

        return channel <= 0.04045
          ? channel / 12.92
          : Math.pow((channel + 0.055) / 1.055, 2.4);
      };

      return (
        0.2126 * linearize(rgb.r) +
        0.7152 * linearize(rgb.g) +
        0.0722 * linearize(rgb.b)
      );
    }

    contrastRatio(foreground, background) {
      const foregroundLuminance = this.relativeLuminance(foreground);

      const backgroundLuminance = this.relativeLuminance(background);

      if (foregroundLuminance === null || backgroundLuminance === null) {
        return null;
      }

      const lighter = Math.max(foregroundLuminance, backgroundLuminance);

      const darker = Math.min(foregroundLuminance, backgroundLuminance);

      return (lighter + 0.05) / (darker + 0.05);
    }

    getBestTextColor(background, options = {}) {
      const bg = this.normalize(background);

      if (!bg) return "#ffffff";

      const minimum = options.minimumContrast || this.minimumContrast;

      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };

      const blackRatio = this.contrastRatio(black, bg);
      const whiteRatio = this.contrastRatio(white, bg);

      const best = blackRatio >= whiteRatio ? black : white;

      const bestRatio = Math.max(blackRatio, whiteRatio);

      if (bestRatio >= minimum) {
        return this.toHex(best);
      }

      return this.toHex(best);
    }

    ensureContrast(foreground, background, minimum = this.minimumContrast) {
      const fg = this.normalize(foreground);
      const bg = this.normalize(background);

      if (!fg || !bg) return null;

      const currentRatio = this.contrastRatio(fg, bg);

      if (currentRatio >= minimum) {
        return {
          color: this.toHex(fg),
          ratio: currentRatio,
          adjusted: false,
        };
      }

      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };

      const blackRatio = this.contrastRatio(black, bg);
      const whiteRatio = this.contrastRatio(white, bg);

      const target = blackRatio >= whiteRatio ? black : white;

      const targetRatio = Math.max(blackRatio, whiteRatio);

      if (targetRatio < minimum) {
        return {
          color: this.toHex(target),
          ratio: targetRatio,
          adjusted: true,
          meetsRequirement: false,
        };
      }

      let low = 0;
      let high = 1;
      let best = target;

      for (let i = 0; i < 24; i++) {
        const middle = (low + high) / 2;

        const candidate = {
          r: fg.r + (target.r - fg.r) * middle,
          g: fg.g + (target.g - fg.g) * middle,
          b: fg.b + (target.b - fg.b) * middle,
        };

        const ratio = this.contrastRatio(candidate, bg);

        if (ratio >= minimum) {
          best = candidate;
          high = middle;
        } else {
          low = middle;
        }
      }

      return {
        color: this.toHex(best),
        ratio: this.contrastRatio(best, bg),
        adjusted: true,
        meetsRequirement: true,
      };
    }

    getReadablePalette(palette = {}) {
      const background = this.normalize(palette.background || "#101010");

      const surface = this.normalize(palette.surface || "#202020");

      if (!background || !surface) return null;

      const text = this.getBestTextColor(background);

      const surfaceText = this.getBestTextColor(surface);

      const mutedResult = this.ensureContrast(
        palette.muted || "#aaaaaa",
        background,
        3,
      );

      const borderResult = this.ensureContrast(
        palette.border || "#444444",
        background,
        1.5,
      );

      return {
        ...palette,
        text,
        surfaceText,
        muted: mutedResult?.color || "#aaaaaa",
        border: borderResult?.color || "#444444",
        contrast: {
          text: this.contrastRatio(text, background),
          surfaceText: this.contrastRatio(surfaceText, surface),
          muted: this.contrastRatio(mutedResult?.color, background),
        },
      };
    }

    captureOriginalVariables() {
      if (!document.documentElement) return;

      const root = document.documentElement;

      ["--af-text", "--af-muted", "--af-surface-text", "--af-border"].forEach(
        (variable) => {
          if (!this.originalVariables.has(variable)) {
            this.originalVariables.set(
              variable,
              root.style.getPropertyValue(variable),
            );
          }
        },
      );
    }

    apply(palette = {}) {
      if (this.isDestroyed || !palette) return false;

      const readablePalette = this.getReadablePalette(palette);

      if (!readablePalette) return false;

      this.captureOriginalVariables();

      const root = document.documentElement;

      root.style.setProperty("--af-text", readablePalette.text);

      root.style.setProperty("--af-muted", readablePalette.muted);

      root.style.setProperty("--af-surface-text", readablePalette.surfaceText);

      root.style.setProperty("--af-border", readablePalette.border);

      this.isActive = true;

      return readablePalette;
    }

    setMinimumContrast(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return false;

      this.minimumContrast = Math.max(1, Math.min(21, number));

      return true;
    }

    getReport(palette = {}) {
      const readable = this.getReadablePalette(palette);

      if (!readable) return null;

      return {
        palette: readable,
        contrast: readable.contrast,
        minimumContrast: this.minimumContrast,
        wcagAA: readable.contrast.text >= 4.5,
        wcagAAA: readable.contrast.text >= 7,
      };
    }

    reset() {
      if (!document.documentElement) return;

      const root = document.documentElement;

      this.originalVariables.forEach((value, variable) => {
        if (value) {
          root.style.setProperty(variable, value);
        } else {
          root.style.removeProperty(variable);
        }
      });

      this.originalVariables.clear();
      this.isActive = false;
    }

    getStatus() {
      return {
        active: this.isActive,
        minimumContrast: this.minimumContrast,
        destroyed: this.isDestroyed,
      };
    }

    destroy() {
      if (this.isDestroyed) return;

      this.reset();

      this.isDestroyed = true;
    }
  }

  AF.ReadabilityEngine = ReadabilityEngine;

  AF.readabilityEngine = AF.readabilityEngine || new ReadabilityEngine();
})();
