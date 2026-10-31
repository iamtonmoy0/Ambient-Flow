/**
 * YouTube Ambient Flow
 * Color Engine
 *
 * Shared color utilities for palette generation,
 * gradient generation, and readability.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class ColorEngine {
    clamp(value, min = 0, max = 255) {
      return Math.max(min, Math.min(max, value));
    }

    normalize(color) {
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
        r: this.clamp(Number(color.r)),
        g: this.clamp(Number(color.g)),
        b: this.clamp(Number(color.b)),
      };
    }

    hexToRgb(hex) {
      if (typeof hex !== "string") return null;

      let value = hex.trim().replace(/^#/, "");

      if (/^[0-9a-f]{3}$/i.test(value)) {
        value = value
          .split("")
          .map((character) => character + character)
          .join("");
      }

      if (!/^[0-9a-f]{6}$/i.test(value)) {
        return null;
      }

      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
      };
    }

    rgbToHex(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const toHex = (value) => Math.round(value).toString(16).padStart(2, "0");

      return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }

    rgbToString(color, alpha = 1) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const opacity = Math.max(0, Math.min(1, Number(alpha)));

      return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${opacity})`;
    }

    parseColor(value) {
      if (typeof value !== "string") return null;

      const input = value.trim();

      if (input.startsWith("#")) {
        return this.hexToRgb(input);
      }

      const match = input.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
      );

      if (!match) return null;

      return {
        r: this.clamp(Number(match[1])),
        g: this.clamp(Number(match[2])),
        b: this.clamp(Number(match[3])),
      };
    }

    brightness(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    }

    relativeLuminance(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const linearize = (channel) => {
        const value = channel / 255;

        return value <= 0.04045
          ? value / 12.92
          : Math.pow((value + 0.055) / 1.055, 2.4);
      };

      return (
        0.2126 * linearize(rgb.r) +
        0.7152 * linearize(rgb.g) +
        0.0722 * linearize(rgb.b)
      );
    }

    contrastRatio(colorA, colorB) {
      const luminanceA = this.relativeLuminance(colorA);
      const luminanceB = this.relativeLuminance(colorB);

      if (luminanceA === null || luminanceB === null) {
        return null;
      }

      const lighter = Math.max(luminanceA, luminanceB);
      const darker = Math.min(luminanceA, luminanceB);

      return (lighter + 0.05) / (darker + 0.05);
    }

    bestTextColor(background) {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };

      const blackContrast = this.contrastRatio(background, black);
      const whiteContrast = this.contrastRatio(background, white);

      if (blackContrast === null || whiteContrast === null) {
        return "#ffffff";
      }

      return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
    }

    adjustBrightness(color, amount = 0) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const adjustment = Number(amount);

      if (!Number.isFinite(adjustment)) return rgb;

      return {
        r: this.clamp(rgb.r + adjustment),
        g: this.clamp(rgb.g + adjustment),
        b: this.clamp(rgb.b + adjustment),
      };
    }

    darken(color, amount = 20) {
      return this.adjustBrightness(color, -Math.abs(amount));
    }

    lighten(color, amount = 20) {
      return this.adjustBrightness(color, Math.abs(amount));
    }

    mix(colorA, colorB, amount = 0.5) {
      const a = this.normalize(colorA);
      const b = this.normalize(colorB);

      if (!a || !b) return null;

      const t = Math.max(0, Math.min(1, Number(amount)));

      return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
      };
    }

    distance(colorA, colorB) {
      const a = this.normalize(colorA);
      const b = this.normalize(colorB);

      if (!a || !b) return null;

      const redMean = (a.r + b.r) / 2;
      const red = a.r - b.r;
      const green = a.g - b.g;
      const blue = a.b - b.b;

      return Math.sqrt(
        (2 + redMean / 256) * red * red +
          4 * green * green +
          (2 + (255 - redMean) / 256) * blue * blue,
      );
    }

    rgbToHsl(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const r = rgb.r / 255;
      const g = rgb.g / 255;
      const b = rgb.b / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      let h = 0;
      let s = 0;

      const l = (max + min) / 2;

      if (max !== min) {
        const delta = max - min;

        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

        switch (max) {
          case r:
            h = (g - b) / delta + (g < b ? 6 : 0);
            break;

          case g:
            h = (b - r) / delta + 2;
            break;

          case b:
            h = (r - g) / delta + 4;
            break;
        }

        h /= 6;
      }

      return {
        h: h * 360,
        s: s * 100,
        l: l * 100,
      };
    }

    hslToRgb(hsl) {
      if (
        !hsl ||
        !Number.isFinite(Number(hsl.h)) ||
        !Number.isFinite(Number(hsl.s)) ||
        !Number.isFinite(Number(hsl.l))
      ) {
        return null;
      }

      let h = ((Number(hsl.h) % 360) + 360) % 360;
      let s = Math.max(0, Math.min(100, Number(hsl.s))) / 100;
      let l = Math.max(0, Math.min(100, Number(hsl.l))) / 100;

      h /= 360;

      if (s === 0) {
        const gray = Math.round(l * 255);

        return { r: gray, g: gray, b: gray };
      }

      const hueToRgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;

        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;

      const p = 2 * l - q;

      return {
        r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hueToRgb(p, q, h) * 255),
        b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
      };
    }

    rotateHue(color, degrees = 30) {
      const hsl = this.rgbToHsl(color);

      if (!hsl) return null;

      return this.hslToRgb({
        ...hsl,
        h: (hsl.h + Number(degrees) + 360) % 360,
      });
    }

    complementary(color) {
      return this.rotateHue(color, 180);
    }

    analogous(color, angle = 30) {
      return {
        previous: this.rotateHue(color, -Math.abs(angle)),
        next: this.rotateHue(color, Math.abs(angle)),
      };
    }

    saturate(color, amount = 10) {
      const hsl = this.rgbToHsl(color);

      if (!hsl) return null;

      return this.hslToRgb({
        ...hsl,
        s: Math.max(0, Math.min(100, hsl.s + Number(amount))),
      });
    }

    desaturate(color, amount = 10) {
      return this.saturate(color, -Math.abs(amount));
    }

    isDark(color, threshold = 128) {
      const value = this.brightness(color);

      return value === null ? false : value < threshold;
    }

    createHarmony(color) {
      const rgb = this.normalize(color);

      if (!rgb) return null;

      const analogous = this.analogous(rgb);

      return {
        primary: rgb,
        complementary: this.complementary(rgb),
        analogousPrevious: analogous.previous,
        analogousNext: analogous.next,
        lighter: this.lighten(rgb, 35),
        darker: this.darken(rgb, 35),
      };
    }
  }

  AF.ColorEngine = ColorEngine;
  AF.colorEngine = AF.colorEngine || new ColorEngine();
})();
