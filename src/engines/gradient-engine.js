/**
 * YouTube Ambient Flow
 * Gradient Engine
 *
 * Generates smooth, responsive ambient backgrounds.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class GradientEngine {
    constructor() {
      this.previousGradient = null;
      this.transitionDuration = 500;
      this.intensity = 0.65;
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

    clamp(value) {
      return Math.max(0, Math.min(255, value));
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

    rgbToString(color, alpha = 1) {
      const { r, g, b } = color;

      return `rgba(${this.clamp(r)}, ${this.clamp(g)}, ${this.clamp(b)}, ${Math.max(0, Math.min(1, alpha))})`;
    }

    mix(colorA, colorB, amount) {
      const t = Math.max(0, Math.min(1, amount));

      return {
        r: colorA.r + (colorB.r - colorA.r) * t,
        g: colorA.g + (colorB.g - colorA.g) * t,
        b: colorA.b + (colorB.b - colorA.b) * t,
      };
    }

    createLinear(color, options = {}) {
      const source = this.normalizeColor(color);

      if (!source) return null;

      const intensity = Math.max(
        0,
        Math.min(1, Number(options.intensity ?? this.intensity)),
      );

      const secondary = this.mix(source, { r: 10, g: 10, b: 10 }, 0.45);

      const tertiary = this.mix(source, { r: 0, g: 0, b: 0 }, 0.75);

      return `
        linear-gradient(
          135deg,
          ${this.rgbToString(source, intensity * 0.32)} 0%,
          ${this.rgbToString(secondary, intensity * 0.22)} 45%,
          ${this.rgbToString(tertiary, intensity * 0.16)} 100%
        )
      `.trim();
    }

    createRadial(color, options = {}) {
      const source = this.normalizeColor(color);

      if (!source) return null;

      const intensity = Math.max(
        0,
        Math.min(1, Number(options.intensity ?? this.intensity)),
      );

      return `
        radial-gradient(
          ellipse at 50% 0%,
          ${this.rgbToString(source, intensity * 0.35)} 0%,
          ${this.rgbToString(source, intensity * 0.16)} 35%,
          transparent 75%
        )
      `.trim();
    }

    createAmbient(color, options = {}) {
      const source = this.normalizeColor(color);

      if (!source) return null;

      const intensity = Math.max(
        0,
        Math.min(1, Number(options.intensity ?? this.intensity)),
      );

      const secondary = this.mix(source, { r: 0, g: 0, b: 0 }, 0.4);

      const tertiary = this.mix(source, { r: 255, g: 255, b: 255 }, 0.12);

      const first = `
        radial-gradient(
          ellipse at 15% 10%,
          ${this.rgbToString(source, intensity * 0.24)} 0%,
          transparent 55%
        )
      `;

      const second = `
        radial-gradient(
          ellipse at 85% 15%,
          ${this.rgbToString(tertiary, intensity * 0.14)} 0%,
          transparent 50%
        )
      `;

      const third = `
        linear-gradient(
          145deg,
          ${this.rgbToString(secondary, intensity * 0.15)},
          transparent 70%
        )
      `;

      return [first.trim(), second.trim(), third.trim()].join(", ");
    }

    create(color, options = {}) {
      const type = options.type || "ambient";

      let gradient;

      switch (type) {
        case "linear":
          gradient = this.createLinear(color, options);
          break;

        case "radial":
          gradient = this.createRadial(color, options);
          break;

        case "ambient":
        default:
          gradient = this.createAmbient(color, options);
          break;
      }

      if (gradient) {
        this.previousGradient = gradient;
      }

      return gradient;
    }

    setIntensity(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return false;
      }

      this.intensity = Math.max(0, Math.min(1, number));

      return true;
    }

    setTransitionDuration(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return false;
      }

      this.transitionDuration = Math.max(0, Math.min(3000, number));

      return true;
    }

    getTransitionDuration() {
      return this.transitionDuration;
    }

    getPreviousGradient() {
      return this.previousGradient;
    }

    reset() {
      this.previousGradient = null;
    }

    destroy() {
      this.reset();
    }
  }

  AF.GradientEngine = GradientEngine;

  AF.gradientEngine = AF.gradientEngine || new GradientEngine();
})();
