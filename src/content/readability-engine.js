(() => {
  "use strict";

  const AF = window.AmbientFlow;
  const utils = AF.utils;

  class ReadabilityEngine {
    constructor() {
      this.enabled = true;
      this.minimumContrast = 4.5;
      this.lastPalette = null;
    }

    // Calculate WCAG contrast ratio
    contrastRatio(color1, color2) {
      const luminance1 = utils.luminance(utils.hexToRgb(color1));

      const luminance2 = utils.luminance(utils.hexToRgb(color2));

      const lighter = Math.max(luminance1, luminance2);

      const darker = Math.min(luminance1, luminance2);

      return (lighter + 0.05) / (darker + 0.05);
    }

    // Select the most readable text color
    getReadableText(background) {
      const white = "#FFFFFF";
      const black = "#000000";

      const whiteContrast = this.contrastRatio(white, background);

      const blackContrast = this.contrastRatio(black, background);

      return whiteContrast >= blackContrast ? white : black;
    }

    // Check whether text meets minimum contrast
    isReadable(text, background) {
      return this.contrastRatio(text, background) >= this.minimumContrast;
    }

    // Adjust a palette to improve readability
    optimizePalette(palette) {
      if (!this.enabled || !palette) {
        return palette;
      }

      const optimized = { ...palette };

      optimized.text = this.getReadableText(optimized.background);

      optimized.mutedText =
        optimized.text === "#FFFFFF" ? "#C5C5C5" : "#555555";

      // Keep surfaces visually distinct from the background
      const backgroundRgb = utils.hexToRgb(optimized.background);

      const surfaceRgb = utils.hexToRgb(optimized.surface);

      if (colorsDistance(backgroundRgb, surfaceRgb) < 10) {
        const adjustment = optimized.text === "#FFFFFF" ? 8 : -8;

        const adjusted = AF.colorEngine.adjustBrightness(
          surfaceRgb,
          adjustment,
        );

        optimized.surface = utils.rgbToHex(adjusted);
      }

      this.lastPalette = optimized;

      return optimized;
    }

    // Update minimum contrast requirement
    setMinimumContrast(value) {
      this.minimumContrast = Math.max(3, Math.min(7, Number(value) || 4.5));
    }

    // Enable or disable readability optimization
    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
    }

    // Return readability diagnostics
    getStatus() {
      return {
        enabled: this.enabled,
        minimumContrast: this.minimumContrast,
        lastPalette: this.lastPalette,
      };
    }

    reset() {
      this.lastPalette = null;
    }
  }

  // Calculate RGB distance
  function colorsDistance(a, b) {
    return Math.sqrt(
      Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2),
    );
  }

  AF.ReadabilityEngine = ReadabilityEngine;
  AF.readabilityEngine = new ReadabilityEngine();
})();
