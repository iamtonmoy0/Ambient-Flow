/**
 * YouTube Ambient Flow
 * Ambient Glow Engine
 *
 * Creates a video-responsive ambient glow around the YouTube player.
 *
 * Features:
 * - Player-relative positioning
 * - Dynamic video color updates
 * - Configurable blur, spread and opacity
 * - Smooth color transitions
 * - Resize, scroll and fullscreen tracking
 * - YouTube SPA navigation support
 * - Reduced-motion support
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

      this.positionObserver = null;
      this.playerResizeObserver = null;
      this.positionUpdateHandler = null;
      this.positionTrackingStarted = false;
      this.observedPlayer = null;
      this.animationFrame = null;

      this.ensureElement();
      this.startTracking();
    }

    /**
     * Find the active YouTube player.
     */
    getPlayer() {
      return (
        document.querySelector("#movie_player") ||
        document.querySelector(".html5-video-player") ||
        document.querySelector("ytd-player")
      );
    }

    /**
     * Get the video element belonging to the player.
     */
    getVideo(player = this.getPlayer()) {
      if (!player) return null;

      return (
        player.querySelector("video.html5-main-video") ||
        player.querySelector("video")
      );
    }

    /**
     * Create or recover the glow element.
     */
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

    /**
     * Base styling for the player-relative glow.
     */
    applyBaseStyles() {
      if (!this.element) return;

      Object.assign(this.element.style, {
        position: "fixed",

        left: "0px",
        top: "0px",

        width: "0px",
        height: "0px",

        boxSizing: "border-box",

        pointerEvents: "none",
        userSelect: "none",

        zIndex: "1",

        opacity: "0",
        visibility: "hidden",

        background: "transparent",
        boxShadow: "none",

        border: "none",
        borderRadius: "0",

        transition: this.reducedMotion
          ? "none"
          : `opacity ${this.transitionDuration}ms ease, box-shadow ${this.transitionDuration}ms ease`,

        contain: "none",
      });
    }

    /**
     * Keep a number between 0 and 255.
     */
    clamp(value) {
      return Math.max(0, Math.min(255, value));
    }

    /**
     * Convert HEX or RGB input into a normalized RGB object.
     */
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

    /**
     * Convert HEX to RGB.
     */
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

    /**
     * Convert RGB to CSS rgba().
     */
    rgba(color, alpha) {
      const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));

      return `rgba(
        ${Math.round(color.r)},
        ${Math.round(color.g)},
        ${Math.round(color.b)},
        ${safeAlpha}
      )`;
    }

    /**
     * Create layered shadows around the video player.
     *
     * The glow element itself remains transparent.
     * Only the shadows extend beyond its boundaries.
     */
    createGlow(color) {
      const rgb = this.normalizeColor(color);

      if (!rgb) return null;

      const opacity = Math.max(
        0,
        Math.min(1, this.intensity * this.settings.opacity),
      );

      const blur = Math.max(
        20,
        Math.min(250, Number(this.settings.blur) || 100),
      );

      const spread = Math.max(
        0,
        Math.min(100, Number(this.settings.spread) || 35),
      );

      const secondary = {
        r: this.clamp(rgb.r * 0.65),
        g: this.clamp(rgb.g * 0.65),
        b: this.clamp(rgb.b * 0.65),
      };

      return [
        `0 0 ${blur}px ${spread}px ${this.rgba(rgb, opacity * 0.55)}`,
        `0 0 ${blur * 1.8}px ${spread * 1.5}px ${this.rgba(rgb, opacity * 0.28)}`,
        `0 0 ${blur * 2.5}px ${spread * 2}px ${this.rgba(secondary, opacity * 0.16)}`,
      ].join(", ");
    }

    /**
     * Update glow dimensions to match the actual YouTube player.
     */
    updatePosition() {
      if (!this.element) return false;

      const player = this.getPlayer();
      if (!player) return false;

      const rect = player.getBoundingClientRect();

      if (!rect.width || !rect.height) return false;

      this.observePlayer(player);

      const style = this.element.style;

      // Override conflicting YouTube or extension CSS.
      style.setProperty("position", "fixed", "important");
      style.setProperty("inset", "auto", "important");

      style.setProperty("top", `${rect.top}px`, "important");
      style.setProperty("left", `${rect.left}px`, "important");
      style.setProperty("width", `${rect.width}px`, "important");
      style.setProperty("height", `${rect.height}px`, "important");

      style.setProperty("z-index", "1", "important");

      style.setProperty("pointer-events", "none", "important");

      return true;
    }
    /**
     * Observe player size changes.
     */
    observePlayer(player) {
      if (!player || this.observedPlayer === player) return;

      this.observedPlayer = player;

      if (this.playerResizeObserver) {
        this.playerResizeObserver.disconnect();
      }

      if (typeof ResizeObserver !== "undefined") {
        this.playerResizeObserver = new ResizeObserver(() => {
          this.schedulePositionUpdate();
        });

        this.playerResizeObserver.observe(player);
      }
    }

    /**
     * Schedule position updates without creating excessive work.
     */
    schedulePositionUpdate() {
      if (this.isDestroyed || this.animationFrame !== null) return;

      this.animationFrame = requestAnimationFrame(() => {
        this.animationFrame = null;

        if (this.isVisible) {
          this.updatePosition();
        }
      });
    }

    /**
     * Start tracking scrolling, resizing and YouTube navigation.
     */
    startTracking() {
      if (this.positionTrackingStarted || this.isDestroyed) return;

      this.positionTrackingStarted = true;

      this.positionUpdateHandler = () => {
        this.schedulePositionUpdate();
      };

      window.addEventListener("resize", this.positionUpdateHandler, {
        passive: true,
      });

      window.addEventListener("scroll", this.positionUpdateHandler, {
        passive: true,
        capture: true,
      });

      document.addEventListener("fullscreenchange", this.positionUpdateHandler);

      document.addEventListener(
        "yt-navigate-finish",
        this.positionUpdateHandler,
      );

      document.addEventListener(
        "yt-page-data-updated",
        this.positionUpdateHandler,
      );

      if (typeof MutationObserver !== "undefined" && document.body) {
        this.positionObserver = new MutationObserver(() => {
          if (!this.getPlayer()) {
            if (this.element) {
              this.element.style.visibility = "hidden";
            }

            return;
          }

          this.schedulePositionUpdate();
        });

        this.positionObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }

      this.updatePosition();
    }

    /**
     * Update the glow color.
     */
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

      const shadow = this.createGlow(rgb);

      if (!shadow) return false;

      this.previousColor = this.currentColor;
      this.currentColor = rgb;

      element.style.boxShadow = shadow;

      if (this.isVisible) {
        this.updatePosition();

        element.style.opacity = String(Math.min(1, this.intensity));
      }

      return true;
    }

    /**
     * Change glow intensity.
     */
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

    /**
     * Change transition duration.
     */
    setTransitionDuration(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) return false;

      this.transitionDuration = Math.max(0, Math.min(3000, number));

      if (this.element) {
        this.element.style.transition = this.reducedMotion
          ? "none"
          : `opacity ${this.transitionDuration}ms ease, box-shadow ${this.transitionDuration}ms ease`;
      }

      return true;
    }

    /**
     * Update engine settings.
     */
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

      if (this.isVisible) {
        this.updatePosition();
      }

      return true;
    }

    /**
     * Show the glow around the active player.
     */
    show() {
      if (this.isDestroyed || !this.settings.enabled || !this.currentColor) {
        return false;
      }

      const element = this.ensureElement();

      if (!element) return false;

      if (!this.updatePosition()) {
        element.style.opacity = "0";
        element.style.visibility = "hidden";

        this.isVisible = false;

        return false;
      }

      element.style.visibility = "visible";
      element.style.opacity = String(this.intensity);

      this.isVisible = true;

      return true;
    }

    /**
     * Hide the glow without discarding the current color.
     */
    hide() {
      if (!this.element) {
        this.isVisible = false;
        return;
      }

      this.element.style.opacity = "0";
      this.element.style.visibility = "hidden";

      this.isVisible = false;
    }

    /**
     * Clear the current glow color.
     */
    reset() {
      this.hide();

      this.currentColor = null;
      this.previousColor = null;

      if (this.element) {
        this.element.style.boxShadow = "none";
      }
    }

    /**
     * Return current engine status.
     */
    getStatus() {
      return {
        visible: this.isVisible,
        enabled: this.settings.enabled,
        intensity: this.intensity,
        color: this.currentColor,
        transitionDuration: this.transitionDuration,

        playerFound: !!this.getPlayer(),

        elementConnected: !!this.element?.isConnected,

        playerRelative: true,
      };
    }

    /**
     * Destroy the engine and remove event listeners.
     */
    destroy() {
      if (this.isDestroyed) return;

      this.reset();

      if (this.positionObserver) {
        this.positionObserver.disconnect();
        this.positionObserver = null;
      }

      if (this.playerResizeObserver) {
        this.playerResizeObserver.disconnect();
        this.playerResizeObserver = null;
      }

      if (this.positionUpdateHandler) {
        window.removeEventListener("resize", this.positionUpdateHandler);

        window.removeEventListener("scroll", this.positionUpdateHandler, true);

        document.removeEventListener(
          "fullscreenchange",
          this.positionUpdateHandler,
        );

        document.removeEventListener(
          "yt-navigate-finish",
          this.positionUpdateHandler,
        );

        document.removeEventListener(
          "yt-page-data-updated",
          this.positionUpdateHandler,
        );
      }

      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }

      this.element?.remove();

      this.element = null;
      this.observedPlayer = null;

      this.positionTrackingStarted = false;
      this.isDestroyed = true;
    }
  }

  AF.AmbientGlow = AmbientGlow;
  AF.ambientGlow = AF.ambientGlow || new AmbientGlow();
})();
