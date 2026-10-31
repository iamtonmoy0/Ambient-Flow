/**
 * YouTube Ambient Flow
 * Palette Engine
 *
 * Generates harmonious colors from video frames.
 * Provides readable foreground colors and background surfaces.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class PaletteEngine {
    constructor() {
      this.previousPalette = null;
      this.smoothingFactor = 0.35;
    }

    clamp(value, min = 0, max = 255) {
      return Math.max(min, Math.min(max, value));
    }

    normalizeColor(color) {
      if (typeof color === "string") {
        return this.hexToRgb(color);
      }

      if (
        !color ||
        !Number.isFinite(color.r) ||
        !Number.isFinite(color.g) ||
        !Number.isFinite(color.b)
      ) {
        return null;
      }

      return {
        r: this.clamp(color.r),
        g: this.clamp(color.g),
        b: this.clamp(color.b),
      };
    }

    hexToRgb(hex) {
      if (typeof hex !== "string") return null;

      const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

      if (!match) return null;

      return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
      };
    }

    rgbToHex(color) {
      const hex = (value) => {
        return Math.round(this.clamp(value)).toString(16).padStart(2, "0");
      };

      return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
    }

    mix(colorA, colorB, amount = 0.5) {
      const t = Math.max(0, Math.min(1, amount));

      return {
        r: colorA.r + (colorB.r - colorA.r) * t,
        g: colorA.g + (colorB.g - colorA.g) * t,
        b: colorA.b + (colorB.b - colorA.b) * t,
      };
    }

    adjustBrightness(color, amount) {
      const target = amount >= 0 ? 255 : 0;
      const factor = Math.abs(amount);

      return this.mix(
        color,
        {
          r: target,
          g: target,
          b: target,
        },
        factor,
      );
    }

    getLuminance(color) {
      const channels = [color.r, color.g, color.b].map((value) => {
        const normalized = value / 255;

        return normalized <= 0.04045
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4);
      });

      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    getContrastRatio(colorA, colorB) {
      const luminanceA = this.getLuminance(colorA);
      const luminanceB = this.getLuminance(colorB);

      const lighter = Math.max(luminanceA, luminanceB);
      const darker = Math.min(luminanceA, luminanceB);

      return (lighter + 0.05) / (darker + 0.05);
    }

    getReadableText(background) {
      const white = { r: 255, g: 255, b: 255 };
      const dark = { r: 20, g: 20, b: 20 };

      const whiteContrast = this.getContrastRatio(background, white);

      const darkContrast = this.getContrastRatio(background, dark);

      return whiteContrast >= darkContrast ? white : dark;
    }

    createPalette(inputColor, options = {}) {
      const source = this.normalizeColor(inputColor);

      if (!source) {
        return null;
      }

      const intensity = Math.max(
        0,
        Math.min(1, Number(options.intensity ?? 0.65)),
      );

      const muted = this.mix(source, { r: 80, g: 80, b: 80 }, 0.25);

      const primary = this.mix(muted, { r: 0, g: 0, b: 0 }, 0.15);

      const secondary = this.mix(primary, { r: 35, g: 35, b: 35 }, 0.35);

      const tertiary = this.mix(primary, { r: 15, g: 15, b: 15 }, 0.55);

      const background = this.mix(
        { r: 12, g: 12, b: 12 },
        primary,
        intensity * 0.42,
      );

      const surface = this.mix(background, { r: 48, g: 48, b: 48 }, 0.35);

      const text = this.getReadableText(surface);

      const palette = {
        primary: this.rgbToHex(primary),
        secondary: this.rgbToHex(secondary),
        tertiary: this.rgbToHex(tertiary),
        background: this.rgbToHex(background),
        surface: this.rgbToHex(surface),
        text: this.rgbToHex(text),
        glow: this.rgbToHex(source),

        muted: this.rgbToHex(muted),

        border: this.rgbToHex(this.mix(surface, text, 0.14)),

        accent: this.rgbToHex(
          this.mix(source, { r: 255, g: 255, b: 255 }, 0.12),
        ),

        raw: {
          r: source.r,
          g: source.g,
          b: source.b,
        },
      };

      return this.smoothPalette(palette);
    }

    smoothPalette(palette) {
      if (!this.previousPalette) {
        this.previousPalette = palette;
        return palette;
      }

      const smoothed = {};

      const colorKeys = [
        "primary",
        "secondary",
        "tertiary",
        "background",
        "surface",
        "text",
        "glow",
        "muted",
        "border",
        "accent",
      ];

      for (const key of colorKeys) {
        const previous = this.hexToRgb(this.previousPalette[key]);

        const current = this.hexToRgb(palette[key]);

        if (!previous || !current) {
          smoothed[key] = palette[key];
          continue;
        }

        smoothed[key] = this.rgbToHex(
          this.mix(previous, current, this.smoothingFactor),
        );
      }

      smoothed.raw = palette.raw;

      this.previousPalette = smoothed;

      return smoothed;
    }

    setSmoothingFactor(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return false;
      }

      this.smoothingFactor = Math.max(0.05, Math.min(1, number));

      return true;
    }

    reset() {
      this.previousPalette = null;
    }

    destroy() {
      this.reset();
    }
  }

  AF.PaletteEngine = PaletteEngine;

  AF.paletteEngine = AF.paletteEngine || new PaletteEngine();
})();
