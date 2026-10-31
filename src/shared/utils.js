(() => {
  "use strict";

  const AF = window.AmbientFlow;

  const utils = {
    // Restrict a number within a range
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    // Convert HEX to RGB
    hexToRgb(hex) {
      const clean = String(hex || "").replace("#", "");

      if (!/^[0-9a-f]{6}$/i.test(clean)) {
        return { r: 36, g: 59, b: 85 };
      }

      return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16),
      };
    },

    // Convert RGB to HEX
    rgbToHex({ r, g, b }) {
      return (
        "#" +
        [r, g, b]
          .map((value) =>
            Math.round(this.clamp(value, 0, 255))
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    },

    // Convert RGB to CSS string
    rgbToString({ r, g, b }) {
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    },

    // Mix two colors
    mix(colorA, colorB, amount) {
      const t = this.clamp(amount, 0, 1);

      return {
        r: colorA.r + (colorB.r - colorA.r) * t,
        g: colorA.g + (colorB.g - colorA.g) * t,
        b: colorA.b + (colorB.b - colorA.b) * t,
      };
    },

    // Calculate relative luminance
    luminance({ r, g, b }) {
      const convert = (value) => {
        value /= 255;

        return value <= 0.04045
          ? value / 12.92
          : Math.pow((value + 0.055) / 1.055, 2.4);
      };

      return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
    },

    // Determine whether text should be light or dark
    getContrastColor(color) {
      return this.luminance(color) > 0.45 ? "#111827" : "#ffffff";
    },

    // Get current YouTube video ID
    getVideoId() {
      try {
        const url = new URL(window.location.href);

        return url.searchParams.get("v") || url.pathname.split("/")[2] || null;
      } catch {
        return null;
      }
    },

    // Get current YouTube channel or video identifier
    getChannelKey() {
      const channel = document.querySelector(
        "ytd-video-owner-renderer a[href], #owner a[href]",
      );

      if (channel) {
        return channel.getAttribute("href") || "default";
      }

      return "default";
    },

    // Detect YouTube Shorts
    isShorts() {
      return window.location.pathname.startsWith("/shorts/");
    },

    // Detect YouTube watch page
    isWatchPage() {
      return window.location.pathname === "/watch" || this.isShorts();
    },

    // Check whether browser requests reduced motion
    prefersReducedMotion() {
      return (
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    },

    // Wait helper
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    // Safely dispatch a custom event
    dispatch(name, detail = {}) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    },

    // Generate a random identifier
    generateId() {
      return (
        Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
      );
    },

    // Check whether an element exists
    elementExists(selector) {
      return Boolean(document.querySelector(selector));
    },

    // Safely parse JSON
    parseJSON(value, fallback = {}) {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    },
  };

  AF.utils = utils;
})();
