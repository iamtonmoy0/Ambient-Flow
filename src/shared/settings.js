/* ==========================================
   YOUTUBE AMBIENT FLOW
   Settings Manager
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const DEFAULTS = AF.DEFAULTS || {};

  const VALID_MODES = ["cinematic", "minimal", "vibrant", "relax"];

  const VALID_COLOR_SOURCES = ["dominant", "average", "custom"];

  const VALID_BACKGROUND_STYLES = ["gradient", "solid", "transparent"];

  const VALID_PERFORMANCE_MODES = ["high", "balanced", "battery"];

  const BOOLEAN_SETTINGS = [
    "enabled",
    "autoStart",
    "sceneDetection",
    "ambientGlow",
    "readability",
    "focusMode",
    "shortsSupport",
    "rememberChannelThemes",
    "reducedMotion",
    "frozen",
  ];

  const NUMERIC_SETTINGS = {
    intensity: { min: 0, max: 100 },
    saturation: { min: 0, max: 100 },
    blur: { min: 0, max: 100 },
    transitionMs: { min: 0, max: 5000 },
    sampleInterval: { min: 250, max: 10000 },
  };

  const STRING_SETTINGS = [
    "mode",
    "colorSource",
    "backgroundStyle",
    "performanceMode",
    "frozenColor",
    "customColor",
    "lastColor",
  ];

  const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

  /**
   * Validate a hexadecimal color.
   */
  function isValidColor(value) {
    return typeof value === "string" && COLOR_PATTERN.test(value);
  }

  /**
   * Clamp a numeric setting to its allowed range.
   */
  function normalizeNumber(key, value) {
    const rule = NUMERIC_SETTINGS[key];

    if (!rule) return value;

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return DEFAULTS[key];
    }

    return Math.min(rule.max, Math.max(rule.min, number));
  }

  /**
   * Validate one setting.
   */
  function validateSetting(key, value) {
    if (BOOLEAN_SETTINGS.includes(key)) {
      return typeof value === "boolean" ? value : DEFAULTS[key];
    }

    if (NUMERIC_SETTINGS[key]) {
      return normalizeNumber(key, value);
    }

    if (key === "mode") {
      return VALID_MODES.includes(value) ? value : DEFAULTS.mode;
    }

    if (key === "colorSource") {
      return VALID_COLOR_SOURCES.includes(value) ? value : DEFAULTS.colorSource;
    }

    if (key === "backgroundStyle") {
      return VALID_BACKGROUND_STYLES.includes(value)
        ? value
        : DEFAULTS.backgroundStyle;
    }

    if (key === "performanceMode") {
      return VALID_PERFORMANCE_MODES.includes(value)
        ? value
        : DEFAULTS.performanceMode;
    }

    if (key === "customColor" || key === "frozenColor" || key === "lastColor") {
      return isValidColor(value) ? value : DEFAULTS[key];
    }

    if (key === "channelProfiles") {
      return validateChannelProfiles(value);
    }

    return undefined;
  }

  /**
   * Validate saved channel profiles.
   */
  function validateChannelProfiles(profiles) {
    if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
      return {};
    }

    const result = {};

    for (const [channel, color] of Object.entries(profiles)) {
      if (
        typeof channel === "string" &&
        channel.length <= 200 &&
        isValidColor(color)
      ) {
        result[channel] = color;
      }
    }

    return result;
  }

  /**
   * Validate a settings object.
   * Unknown keys are ignored.
   */
  function validate(settings = {}) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return {};
    }

    const result = {};

    for (const key of [
      ...BOOLEAN_SETTINGS,
      ...Object.keys(NUMERIC_SETTINGS),
      ...STRING_SETTINGS,
      "channelProfiles",
    ]) {
      if (!Object.prototype.hasOwnProperty.call(settings, key)) {
        continue;
      }

      const normalized = validateSetting(key, settings[key]);

      if (normalized !== undefined) {
        result[key] = normalized;
      }
    }

    return result;
  }

  /**
   * Merge defaults with user settings.
   */
  function merge(settings = {}) {
    return {
      ...DEFAULTS,
      ...validate(settings),
    };
  }

  /**
   * Get a mode configuration.
   */
  function getMode(modeName) {
    const selectedMode = VALID_MODES.includes(modeName)
      ? modeName
      : DEFAULTS.mode;

    return {
      ...(AF.MODES?.[selectedMode] || AF.MODES?.cinematic || {}),
    };
  }

  /**
   * Get a performance configuration.
   */
  function getPerformance(modeName) {
    const selectedMode = VALID_PERFORMANCE_MODES.includes(modeName)
      ? modeName
      : DEFAULTS.performanceMode;

    return {
      ...(AF.PERFORMANCE?.[selectedMode] || AF.PERFORMANCE?.balanced || {}),
    };
  }

  /**
   * Calculate settings after applying the selected mode.
   *
   * Explicit user values take priority over mode presets.
   */
  function getEffective(settings = {}) {
    const normalized = merge(settings);
    const mode = getMode(normalized.mode);
    const performance = getPerformance(normalized.performanceMode);

    return {
      ...normalized,

      intensity: normalized.intensity ?? mode.intensity,
      saturation: normalized.saturation ?? mode.saturation,
      blur: normalized.blur ?? mode.blur,
      transitionMs: normalized.transitionMs ?? mode.transitionMs,

      ...{
        sampleInterval: normalized.sampleInterval ?? performance.sampleInterval,
      },
    };
  }

  /**
   * Read and validate settings from extension storage.
   */
  async function load() {
    if (!AF.storage?.getAll) {
      return merge({});
    }

    try {
      const stored = await AF.storage.getAll();
      return merge(stored);
    } catch (error) {
      console.error("[Ambient Flow] Could not load settings:", error);

      return merge({});
    }
  }

  /**
   * Validate and save settings.
   */
  async function save(settings = {}) {
    const normalized = validate(settings);

    if (!AF.storage?.set) {
      throw new Error("Settings storage is unavailable.");
    }

    await AF.storage.set(normalized);

    return normalized;
  }

  /**
   * Restore default settings.
   */
  async function reset() {
    if (!AF.storage?.reset) {
      throw new Error("Settings storage is unavailable.");
    }

    await AF.storage.reset();

    return merge({});
  }

  /**
   * Get a safe settings export.
   */
  async function exportSettings() {
    const settings = await load();

    return JSON.stringify(
      {
        application: "YouTube Ambient Flow",
        version: chrome.runtime.getManifest().version,
        exportedAt: new Date().toISOString(),
        settings,
      },
      null,
      2,
    );
  }

  /**
   * Import settings from JSON.
   */
  async function importSettings(json) {
    let parsed;

    try {
      parsed = typeof json === "string" ? JSON.parse(json) : json;
    } catch {
      throw new Error("Invalid settings JSON.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Settings file must contain an object.");
    }

    const imported = parsed.settings || parsed;

    const normalized = validate(imported);

    if (Object.keys(normalized).length === 0) {
      throw new Error("No valid settings were found.");
    }

    await save(normalized);

    return normalized;
  }

  AF.settings = {
    DEFAULTS,
    VALID_MODES,
    VALID_COLOR_SOURCES,
    VALID_BACKGROUND_STYLES,
    VALID_PERFORMANCE_MODES,

    isValidColor,
    validateSetting,
    validate,
    merge,
    getMode,
    getPerformance,
    getEffective,
    load,
    save,
    reset,
    exportSettings,
    importSettings,
  };
})();
