(() => {
  "use strict";

  const AF = window.AmbientFlow;
  const utils = AF.utils;
  const colors = AF.colorEngine;

  const gradientEngine = {
    // Convert RGB color into CSS HEX
    hex(color) {
      return utils.rgbToHex(color);
    },

    // Create a darker background color
    createBackground(color, intensity = 68) {
      const hsl = colors.rgbToHsl(color);

      hsl.s = utils.clamp(hsl.s, 15, 75);
      hsl.l = utils.clamp(5 + intensity * 0.08, 5, 18);

      return colors.hslToRgb(hsl);
    },

    // Create secondary gradient color
    createSecondary(color, amount = 25) {
      return colors.adjustBrightness(color, amount);
    },

    // Create tertiary gradient color
    createTertiary(color, amount = -20) {
      return colors.adjustBrightness(color, amount);
    },

    // Generate a complete CSS gradient
    generate(color, settings = {}) {
      const intensity = utils.clamp(settings.intensity ?? 68, 0, 100);

      const style = settings.backgroundStyle || "gradient";

      const primary = colors.adjustSaturation(color, settings.saturation ?? 72);

      const background = this.createBackground(primary, intensity);

      const secondary = this.createSecondary(primary, 20);

      const tertiary = this.createTertiary(primary, -25);

      const backgroundHex = this.hex(background);
      const primaryHex = this.hex(primary);
      const secondaryHex = this.hex(secondary);
      const tertiaryHex = this.hex(tertiary);

      if (style === "solid") {
        return {
          background: backgroundHex,
          primary: primaryHex,
          secondary: secondaryHex,
          tertiary: tertiaryHex,
          gradient: backgroundHex,
          glow: `0 0 80px ${primaryHex}33`,
        };
      }

      if (style === "radial") {
        return {
          background: backgroundHex,
          primary: primaryHex,
          secondary: secondaryHex,
          tertiary: tertiaryHex,
          gradient: `
            radial-gradient(
              ellipse at 50% 0%,
              ${primaryHex}55 0%,
              ${backgroundHex} 65%
            )
          `,
          glow: `0 0 100px ${primaryHex}44`,
        };
      }

      return {
        background: backgroundHex,
        primary: primaryHex,
        secondary: secondaryHex,
        tertiary: tertiaryHex,

        gradient: `
          linear-gradient(
            135deg,
            ${backgroundHex} 0%,
            ${tertiaryHex} 45%,
            ${primaryHex}55 100%
          )
        `,

        glow: `
          0 0 80px ${primaryHex}33,
          0 0 140px ${secondaryHex}22
        `,
      };
    },

    // Generate layered ambient glow
    generateGlow(color, intensity = 68) {
      const hex = this.hex(color);

      const opacity = utils.clamp(intensity / 100, 0, 1);

      return `
        radial-gradient(
          ellipse at 50% 0%,
          ${hex}${Math.round(opacity * 70)
            .toString(16)
            .padStart(2, "0")},
          transparent 70%
        )
      `;
    },

    // Generate CSS variables for the theme engine
    createPalette(color, settings = {}) {
      const result = this.generate(color, settings);

      return {
        "--af-primary": result.primary,
        "--af-secondary": result.secondary,
        "--af-tertiary": result.tertiary,
        "--af-background": result.background,
        "--af-gradient": result.gradient,
        "--af-glow": result.glow,
      };
    },
  };

  AF.gradientEngine = gradientEngine;
})();

(() => {
  "use strict";

  const AF = window.AmbientFlow;
  const utils = AF.utils;
  const colors = AF.colorEngine;
  const gradients = AF.gradientEngine;

  const paletteEngine = {
    // Generate the complete YouTube theme palette
    generate(color, settings = {}) {
      const intensity = utils.clamp(settings.intensity ?? 68, 0, 100);

      const saturation = utils.clamp(settings.saturation ?? 72, 0, 100);

      const primary = colors.adjustSaturation(color, saturation);

      const background = gradients.createBackground(primary, intensity);

      const surface = colors.adjustBrightness(background, 4);

      const elevatedSurface = colors.adjustBrightness(background, 8);

      const secondary = colors.adjustBrightness(primary, 18);

      const accent = colors.adjustBrightness(primary, 30);

      const isLight = utils.luminance(background) > 0.35;

      const text = isLight ? "#111111" : "#F5F5F5";
      const mutedText = isLight ? "#555555" : "#AAAAAA";

      const border = isLight
        ? "rgba(0, 0, 0, 0.12)"
        : "rgba(255, 255, 255, 0.10)";

      const palette = {
        primary: colors.toHex(primary),
        secondary: colors.toHex(secondary),
        accent: colors.toHex(accent),

        background: colors.toHex(background),
        surface: colors.toHex(surface),
        elevatedSurface: colors.toHex(elevatedSurface),

        text,
        mutedText,
        border,

        gradient: gradients.generate(primary, settings).gradient,
        glow: gradients.generateGlow(primary, intensity),

        intensity,
        saturation,
      };

      return palette;
    },

    // Convert palette to CSS custom properties
    toCSSVariables(palette) {
      return {
        "--af-primary": palette.primary,
        "--af-secondary": palette.secondary,
        "--af-tertiary": palette.accent,

        "--af-background": palette.background,
        "--af-surface": palette.surface,
        "--af-surface-elevated": palette.elevatedSurface,

        "--af-text": palette.text,
        "--af-text-muted": palette.mutedText,

        "--af-border": palette.border,
        "--af-gradient": palette.gradient,
        "--af-glow": palette.glow,

        "--af-intensity": String(palette.intensity / 100),
      };
    },

    // Return a safe default palette
    getDefault() {
      return this.generate(
        { r: 36, g: 59, b: 85 },
        {
          intensity: 68,
          saturation: 72,
        },
      );
    },
  };

  AF.paletteEngine = paletteEngine;
})();
