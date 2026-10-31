/**
 * YouTube Ambient Flow
 * Ambient Glow Engine
 *
 * Creates a soft video-responsive ambient glow.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const ELEMENT_ID = "ambient-flow-glow";

  class AmbientGlow {
    constructor() {
      this.element = null;

      this.currentColor = null;
      this.previousColor = null;

      this.intensity = 0.65;
      this.transitionDuration = 500;

      this.isVisible = false;
      this.isDestroyed = false;

      this.settings = {
        enabled: true,
        blur: 100,
        spread: 35,
        opacity: 0.65,
      };

      this.reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
        false;

      this.ensureElement();
    }

    ensureElement() {
      if (this.isDestroyed) return null;

      if (this.element?.isConnected) {
        return this.element;
      }

      let element = document.getElementById(ELEMENT_ID);

      if (!element) {
        element = document.createElement("div");

        element.id = ELEMENT_ID;
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("role", "presentation");

        const parent = document.body || document.documentElement;

        parent.appendChild(element);
      }

      this.element = element;

      this.applyBaseStyles();

      return element;
    }

    applyBaseStyles() {
      if (!this.element) return;

      const element = this.element;

      Object.assign(element.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: "0",
        opacity: "0",
        visibility: "hidden",
        background: "none",
        transition: this.reducedMotion
          ? "none"
          : `opacity ${this.transitionDuration}ms ease, background ${this.transitionDuration}ms ease`,
        contain: "strict",
      });
    }

    normalizeColor(color) {
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

    clamp(value) {
      return Math.max(0, Math.min(255, value));
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

      if (!/^[a-f\d]{6}$/i.test(value)) {
        return null;
      }

      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
      };
    }

    rgba(color, alpha) {
      return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
    }

    createGlow(color) {
      const rgb = this.normalizeColor(color);

      if (!rgb) return null;

      const opacity = Math.max(
        0,
        Math.min(1, this.intensity * this.settings.opacity),
      );

      const blur = Math.max(20, Math.min(250, this.settings.blur));

      const spread = Math.max(0, Math.min(100, this.settings.spread));

      const secondary = {
        r: this.clamp(rgb.r * 0.65),
        g: this.clamp(rgb.g * 0.65),
        b: this.clamp(rgb.b * 0.65),
      };

      return `
        radial-gradient(
          ellipse at 50% 0%,
          ${this.rgba(rgb, opacity * 0.3)} 0%,
          ${this.rgba(rgb, opacity * 0.16)} ${spread}%,
          transparent ${Math.min(95, spread + blur / 4)}%
        ),
        radial-gradient(
          ellipse at 0% 50%,
          ${this.rgba(secondary, opacity * 0.12)} 0%,
          transparent 65%
        ),
        radial-gradient(
          ellipse at 100% 50%,
          ${this.rgba(rgb, opacity * 0.1)} 0%,
          transparent 65%
        )
      `;
    }

    update(color) {
      return this.setColor(color);
    }

    setColor(color) {
      if (this.isDestroyed || !this.settings.enabled) {
        return false;
      }

      const rgb = this.normalizeColor(color);

      if (!rgb) return false;

      const element = this.ensureElement();

      if (!element) return false;

      const background = this.createGlow(rgb);

      if (!background) return false;

      this.previousColor = this.currentColor;
      this.currentColor = rgb;

      element.style.background = background;

      if (this.isVisible) {
        element.style.opacity = String(Math.min(1, this.intensity));
      }

      return true;
    }

    setIntensity(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return false;

      this.intensity = Math.max(0, Math.min(1, number));

      if (this.currentColor) {
        this.setColor(this.currentColor);
      }

      if (this.element && this.isVisible) {
        this.element.style.opacity = String(this.intensity);
      }

      return true;
    }

    setTransitionDuration(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return false;

      this.transitionDuration = Math.max(0, Math.min(3000, number));

      if (this.element) {
        this.element.style.transition = this.reducedMotion
          ? "none"
          : `opacity ${this.transitionDuration}ms ease, background ${this.transitionDuration}ms ease`;
      }

      return true;
    }

    setOptions(options = {}) {
      if (!options || typeof options !== "object") {
        return false;
      }

      this.settings = {
        ...this.settings,
        ...options,
      };

      if (options.intensity !== undefined) {
        this.setIntensity(options.intensity);
      }

      if (options.transitionDuration !== undefined) {
        this.setTransitionDuration(options.transitionDuration);
      }

      if (options.enabled === false) {
        this.hide();
      }

      if (this.currentColor && this.settings.enabled) {
        this.setColor(this.currentColor);
      }

      return true;
    }

    show() {
      if (this.isDestroyed || !this.settings.enabled || !this.currentColor) {
        return false;
      }

      const element = this.ensureElement();

      if (!element) return false;

      element.style.visibility = "visible";
      element.style.opacity = String(this.intensity);

      this.isVisible = true;

      return true;
    }

    hide() {
      if (!this.element) {
        this.isVisible = false;
        return;
      }

      this.element.style.opacity = "0";
      this.element.style.visibility = "hidden";
      this.element.style.background = "none";

      this.isVisible = false;
    }

    reset() {
      this.hide();

      this.currentColor = null;
      this.previousColor = null;

      if (this.element) {
        this.element.style.background = "none";
      }
    }

    getStatus() {
      return {
        visible: this.isVisible,
        enabled: this.settings.enabled,
        intensity: this.intensity,
        color: this.currentColor,
        transitionDuration: this.transitionDuration,
      };
    }

    destroy() {
      if (this.isDestroyed) return;

      this.reset();

      this.element?.remove();

      this.element = null;
      this.isDestroyed = true;
    }
  }

  AF.AmbientGlow = AmbientGlow;

  AF.ambientGlow = AF.ambientGlow || new AmbientGlow();
})();
