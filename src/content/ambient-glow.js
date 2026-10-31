/* ==========================================
   YOUTUBE AMBIENT FLOW
   Playback-Aware Ambient Glow
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class AmbientGlow {
    constructor() {
      this.elementId = "ambient-flow-glow";

      this.element = null;

      this.enabled = true;
      this.visible = false;

      this.currentColor = "#243b55";

      this.intensity = 0.45;
      this.blur = 54;

      this.transitionMs = 500;

      this.lastPosition = null;
    }

    /* ======================================
       ELEMENT MANAGEMENT
    ====================================== */

    create() {
      if (this.element && this.element.isConnected) {
        return this.element;
      }

      let element = document.getElementById(this.elementId);

      if (!element) {
        element = document.createElement("div");

        element.id = this.elementId;

        element.setAttribute("aria-hidden", "true");

        element.setAttribute("data-af-element", "ambient-glow");

        (document.body || document.documentElement).appendChild(element);
      }

      this.element = element;

      Object.assign(element.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "0",
        opacity: "0",
        visibility: "hidden",
        backgroundRepeat: "no-repeat",
        mixBlendMode: "screen",
        willChange: "opacity, background",
        contain: "strict",
      });

      return element;
    }

    /* ======================================
       COLOR AND SETTINGS
    ====================================== */

    update(color, settings = {}) {
      if (!this.enabled || !color) {
        return false;
      }

      if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return false;
      }

      this.currentColor = color;

      const intensity = Number(settings.intensity ?? 45);

      const blur = Number(settings.blur ?? 54);

      const transition = Number(settings.transitionMs ?? 500);

      this.intensity = Math.max(0, Math.min(100, intensity)) / 100;

      this.blur = Math.max(0, Math.min(100, blur));

      this.transitionMs = Math.max(0, Math.min(5000, transition));

      const element = this.create();

      const glowOpacity = this.intensity * 0.75;

      element.style.setProperty(
        "transition",
        `opacity ${this.transitionMs}ms ease, background ${this.transitionMs}ms ease`,
      );

      element.style.setProperty("filter", `blur(${this.blur}px)`);

      element.style.setProperty(
        "background",
        `
          radial-gradient(
            ellipse at 50% 45%,
            ${color} ${Math.max(5, glowOpacity * 25)}%,
            transparent 75%
          )
        `,
      );

      return true;
    }

    /* ======================================
       POSITIONING
    ====================================== */

    updatePosition(player) {
      if (!player || !player.isConnected || !this.element) {
        return;
      }

      const rect = player.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      const centerX = rect.left + rect.width / 2;

      const centerY = rect.top + rect.height / 2;

      const position = {
        x: Math.round(centerX),
        y: Math.round(centerY),
      };

      if (
        this.lastPosition?.x === position.x &&
        this.lastPosition?.y === position.y
      ) {
        return;
      }

      this.lastPosition = position;

      this.element.style.backgroundPosition = `${position.x}px ${position.y}px`;
    }

    /* ======================================
       SHOW AND HIDE
    ====================================== */

    show() {
      if (!this.enabled) return false;

      const element = this.create();

      element.style.visibility = "visible";
      element.style.opacity = String(Math.min(0.75, this.intensity * 0.75));

      this.visible = true;

      return true;
    }

    /**
     * Hide immediately when playback stops.
     * No fade-out is used because the user wants
     * the original YouTube appearance immediately.
     */
    hide() {
      if (!this.element) {
        this.visible = false;
        return;
      }

      this.element.style.transition = "none";
      this.element.style.opacity = "0";
      this.element.style.visibility = "hidden";

      this.visible = false;
      this.lastPosition = null;
    }

    /* ======================================
       CONFIGURATION
    ====================================== */

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);

      if (!this.enabled) {
        this.hide();
      }
    }

    setIntensity(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return;

      this.intensity = Math.max(0, Math.min(100, number)) / 100;

      if (this.visible && this.element) {
        this.element.style.opacity = String(
          Math.min(0.75, this.intensity * 0.75),
        );
      }
    }

    setBlur(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return;

      this.blur = Math.max(0, Math.min(100, number));

      if (this.element) {
        this.element.style.filter = `blur(${this.blur}px)`;
      }
    }

    /* ======================================
       STATUS
    ====================================== */

    getStatus() {
      return {
        enabled: this.enabled,
        visible: this.visible,
        color: this.currentColor,
        intensity: this.intensity,
        blur: this.blur,
      };
    }

    /* ======================================
       CLEANUP
    ====================================== */

    destroy() {
      this.hide();

      if (this.element?.isConnected) {
        this.element.remove();
      }

      this.element = null;
      this.visible = false;
      this.enabled = false;
      this.lastPosition = null;
    }
  }

  AF.AmbientGlow = AmbientGlow;
  AF.ambientGlow = new AmbientGlow();
})();
