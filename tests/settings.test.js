/**
 * YouTube Ambient Flow
 * Settings Tests
 *
 * Run:
 * npm test
 *
 * Requires Jest and a settings module that exports
 * DEFAULTS, PRESETS, and validate().
 */

const { DEFAULTS, PRESETS, validate } = require("../src/shared/settings.js");

describe("Settings Engine", () => {
  describe("Default settings", () => {
    test("should provide default settings", () => {
      expect(DEFAULTS).toBeDefined();

      expect(DEFAULTS).toHaveProperty("enabled");
      expect(DEFAULTS).toHaveProperty("ambientGlow");
      expect(DEFAULTS).toHaveProperty("performanceMode");
      expect(DEFAULTS).toHaveProperty("samplingInterval");
      expect(DEFAULTS).toHaveProperty("sceneThreshold");
      expect(DEFAULTS).toHaveProperty("glowIntensity");
    });

    test("should enable ambient flow by default", () => {
      expect(DEFAULTS.enabled).toBe(true);
    });

    test("should use balanced performance mode by default", () => {
      expect(DEFAULTS.performanceMode).toBe("balanced");
    });

    test("should use valid numeric defaults", () => {
      expect(DEFAULTS.samplingInterval).toBeGreaterThan(0);

      expect(DEFAULTS.sceneThreshold).toBeGreaterThan(0);

      expect(DEFAULTS.glowIntensity).toBeGreaterThanOrEqual(0);

      expect(DEFAULTS.glowIntensity).toBeLessThanOrEqual(100);
    });
  });

  describe("Settings validation", () => {
    test("should accept valid settings", () => {
      const result = validate({
        enabled: true,
        ambientGlow: true,
        performanceMode: "balanced",
        samplingInterval: 700,
        sceneThreshold: 18,
        glowIntensity: 65,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should reject invalid performance mode", () => {
      const result = validate({
        performanceMode: "ultra",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should reject invalid sampling interval", () => {
      const result = validate({
        samplingInterval: -100,
      });

      expect(result.valid).toBe(false);
    });

    test("should reject non-numeric sampling interval", () => {
      const result = validate({
        samplingInterval: "fast",
      });

      expect(result.valid).toBe(false);
    });

    test("should reject invalid scene threshold", () => {
      const result = validate({
        sceneThreshold: -1,
      });

      expect(result.valid).toBe(false);
    });

    test("should reject glow intensity above 100", () => {
      const result = validate({
        glowIntensity: 150,
      });

      expect(result.valid).toBe(false);
    });

    test("should reject negative glow intensity", () => {
      const result = validate({
        glowIntensity: -10,
      });

      expect(result.valid).toBe(false);
    });

    test("should accept valid boolean settings", () => {
      const result = validate({
        enabled: false,
        ambientGlow: false,
        focusModeEnabled: true,
      });

      expect(result.valid).toBe(true);
    });

    test("should reject invalid boolean values", () => {
      const result = validate({
        enabled: "yes",
      });

      expect(result.valid).toBe(false);
    });

    test("should reject invalid custom colors", () => {
      const result = validate({
        customColor: "not-a-color",
      });

      expect(result.valid).toBe(false);
    });

    test("should accept valid hexadecimal colors", () => {
      const result = validate({
        customColor: "#123456",
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Default merging", () => {
    test("should fill missing settings with defaults", () => {
      const result = validate({
        enabled: false,
      });

      expect(result.valid).toBe(true);

      expect(result.settings.enabled).toBe(false);

      expect(result.settings.performanceMode).toBe(DEFAULTS.performanceMode);
    });

    test("should preserve explicitly supplied values", () => {
      const result = validate({
        enabled: false,
        performanceMode: "quality",
      });

      expect(result.settings.enabled).toBe(false);

      expect(result.settings.performanceMode).toBe("quality");
    });

    test("should not mutate the original input", () => {
      const input = {
        enabled: false,
        performanceMode: "balanced",
      };

      const original = { ...input };

      validate(input);

      expect(input).toEqual(original);
    });
  });

  describe("Performance presets", () => {
    test("should define battery preset", () => {
      expect(PRESETS).toHaveProperty("battery");
    });

    test("should define balanced preset", () => {
      expect(PRESETS).toHaveProperty("balanced");
    });

    test("should define quality preset", () => {
      expect(PRESETS).toHaveProperty("quality");
    });

    test("should have valid sampling intervals in presets", () => {
      Object.values(PRESETS).forEach((preset) => {
        expect(preset.samplingInterval).toBeGreaterThan(0);
      });
    });

    test("should use progressively faster sampling modes", () => {
      expect(PRESETS.battery.samplingInterval).toBeGreaterThanOrEqual(
        PRESETS.balanced.samplingInterval,
      );

      expect(PRESETS.balanced.samplingInterval).toBeGreaterThanOrEqual(
        PRESETS.quality.samplingInterval,
      );
    });
  });

  describe("Focus mode settings", () => {
    test("should accept focus mode options", () => {
      const result = validate({
        focusModeEnabled: true,
        hideSidebar: true,
        hideComments: true,
        hideRecommendations: true,
        hideChat: false,
        hideHeader: false,
        hideShortsControls: true,
      });

      expect(result.valid).toBe(true);

      expect(result.settings.focusModeEnabled).toBe(true);

      expect(result.settings.hideSidebar).toBe(true);
    });

    test("should reject invalid focus mode boolean values", () => {
      const result = validate({
        hideSidebar: "enabled",
      });

      expect(result.valid).toBe(false);
    });
  });

  describe("Boundary values", () => {
    test("should accept zero glow intensity if supported", () => {
      const result = validate({
        glowIntensity: 0,
      });

      expect(result.valid).toBe(true);
    });

    test("should accept maximum glow intensity", () => {
      const result = validate({
        glowIntensity: 100,
      });

      expect(result.valid).toBe(true);
    });

    test("should accept a valid transition duration", () => {
      const result = validate({
        transitionDuration: 1000,
      });

      expect(result.valid).toBe(true);
    });
  });
});
