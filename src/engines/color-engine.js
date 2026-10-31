(() => {
  "use strict";

  const AF = window.AmbientFlow;
  const utils = AF.utils;

  const colorEngine = {
    // Extract average RGB color
    average(data) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;

        if (alpha < 0.5) continue;

        r += data[i];
        g += data[i + 1];
        b += data[i + 2];

        count++;
      }

      if (!count) {
        return { r: 36, g: 59, b: 85 };
      }

      return {
        r: r / count,
        g: g / count,
        b: b / count,
      };
    },

    // Extract dominant color using RGB buckets
    dominant(data) {
      const buckets = new Map();

      for (let i = 0; i < data.length; i += 16) {
        const alpha = data[i + 3];

        if (alpha < 128) continue;

        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;

        const key = `${r},${g},${b}`;

        buckets.set(key, (buckets.get(key) || 0) + 1);
      }

      let bestColor = "32,64,96";
      let maxCount = 0;

      for (const [color, count] of buckets) {
        if (count > maxCount) {
          maxCount = count;
          bestColor = color;
        }
      }

      const [r, g, b] = bestColor.split(",").map(Number);

      return { r, g, b };
    },

    // Extract a color from image data
    extract(imageData, source = "dominant") {
      if (!imageData || !imageData.data) {
        return { r: 36, g: 59, b: 85 };
      }

      if (source === "average") {
        return this.average(imageData.data);
      }

      return this.dominant(imageData.data);
    },

    // Convert RGB to HSL
    rgbToHsl({ r, g, b }) {
      r /= 255;
      g /= 255;
      b /= 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;

        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;

          case g:
            h = (b - r) / d + 2;
            break;

          case b:
            h = (r - g) / d + 4;
            break;
        }

        h /= 6;
      }

      return {
        h: h * 360,
        s: s * 100,
        l: l * 100,
      };
    },

    // Convert HSL to RGB
    hslToRgb({ h, s, l }) {
      h /= 360;
      s /= 100;
      l /= 100;

      const hue = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;

        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

        return p;
      };

      if (s === 0) {
        const value = l * 255;

        return {
          r: value,
          g: value,
          b: value,
        };
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;

      const p = 2 * l - q;

      return {
        r: hue(p, q, h + 1 / 3) * 255,
        g: hue(p, q, h) * 255,
        b: hue(p, q, h - 1 / 3) * 255,
      };
    },

    // Adjust saturation
    adjustSaturation(color, amount = 70) {
      const hsl = this.rgbToHsl(color);

      hsl.s = utils.clamp(amount, 0, 100);

      return this.hslToRgb(hsl);
    },

    // Adjust color brightness
    adjustBrightness(color, amount = 0) {
      const hsl = this.rgbToHsl(color);

      hsl.l = utils.clamp(hsl.l + amount, 0, 100);

      return this.hslToRgb(hsl);
    },

    // Create a darker version of a color
    darken(color, amount = 25) {
      return this.adjustBrightness(color, -amount);
    },

    // Create a lighter version of a color
    lighten(color, amount = 25) {
      return this.adjustBrightness(color, amount);
    },

    // Smoothly interpolate between two colors
    smooth(previous, next, factor = 0.2) {
      if (!previous) return next;

      return utils.mix(previous, next, utils.clamp(factor, 0, 1));
    },

    // Calculate color difference
    distance(a, b) {
      const dr = a.r - b.r;
      const dg = a.g - b.g;
      const db = a.b - b.b;

      return Math.sqrt(dr * dr + dg * dg + db * db);
    },

    // Detect whether a scene has changed significantly
    hasSceneChanged(previous, current, threshold = 45) {
      if (!previous || !current) return true;

      return this.distance(previous, current) > threshold;
    },

    // Convert color to HEX
    toHex(color) {
      return utils.rgbToHex(color);
    },

    // Convert color to CSS RGB
    toCSS(color) {
      return utils.rgbToString(color);
    },
  };

  AF.colorEngine = colorEngine;
})();
