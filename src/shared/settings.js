/**
 * YouTube Ambient Flow
 * Settings Manager
 *
 * Centralized settings validation, normalization,
 * performance presets, and customization.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const DEFAULTS = {
    enabled: true,

    samplingInterval: 700,
    sceneDetection: true,
    sceneThreshold: 18,

    ambientGlow: true,
    smoothTransitions: true,
    backgroundStyle: "gradient",
    glowIntensity: 65,
    intensity: 0.65,
    blur: 80,
    transitionDuration: 800,

    performanceMode: "balanced",

    frozen: false,
    freezeBackground: false,
    frozenColor: null,

    focusModeEnabled: false,
    hideSidebar: true,
    hideComments: false,
    hideRecommendations: false,
    hideChat: true,
    hideHeader: false,
    hideShortsControls: false,
    hideShortsSidebar: false,

    customColor: null,
    lastDetectedColor: null,
    lastUpdated: null,
  };

  const PRESETS = {
    battery: {
      samplingInterval: 1500,
      sceneDetection: true,
      sceneThreshold: 25,
      ambientGlow: true,
      smoothTransitions: false,
      intensity: 0.4,
      blur: 50,
      performanceMode: "battery",
    },

    balanced: {
      samplingInterval: 700,
      sceneDetection: true,
      sceneThreshold: 18,
      ambientGlow: true,
      smoothTransitions: true,
      intensity: 0.65,
      blur: 80,
      performanceMode: "balanced",
    },

    quality: {
      samplingInterval: 400,
      sceneDetection: true,
      sceneThreshold: 12,
      ambientGlow: true,
      smoothTransitions: true,
      intensity: 0.8,
      blur: 110,
      performanceMode: "quality",
    },
  };

  const RANGES = {
    samplingInterval: {
      min: 300,
      max: 3000,
    },

    sceneThreshold: {
      min: 1,
      max: 100,
    },

    glowIntensity: {
      min: 0,
      max: 100,
    },

    intensity: {
      min: 0,
      max: 1,
    },

    blur: {
      min: 0,
      max: 200,
    },

    transitionDuration: {
      min: 0,
      max: 5000,
    },
  };

  const ENUMS = {
    performanceMode: ["battery", "balanced", "quality"],

    backgroundStyle: ["gradient", "solid", "transparent"],
  };

  const BOOLEAN_KEYS = [
    "enabled",
    "sceneDetection",
    "ambientGlow",
    "smoothTransitions",
    "frozen",
    "freezeBackground",
    "focusModeEnabled",
    "hideSidebar",
    "hideComments",
    "hideRecommendations",
    "hideChat",
    "hideHeader",
    "hideShortsControls",
    "hideShortsSidebar",
  ];

  const COLOR_KEYS = ["frozenColor", "customColor", "lastDetectedColor"];

  function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  }

  function clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.max(min, Math.min(max, number));
  }

  function normalizeColor(value) {
    if (value === null || value === "") {
      return null;
    }

    return isHexColor(value) ? value : null;
  }

  const LEGACY_ALIASES = {
    intensity: "glowIntensity",
    sampleInterval: "samplingInterval",
    focusMode: "focusModeEnabled",
    hideShortsSidebar: "hideShortsControls",
  };

  function normalizeIncomingSettings(settings = {}) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return {};
    }

    const canonical = {};

    Object.entries(settings).forEach(([key, value]) => {
      const mapped = LEGACY_ALIASES[key] || key;
      canonical[mapped] = value;
    });

    if (
      Object.prototype.hasOwnProperty.call(settings, "intensity") &&
      Object.prototype.hasOwnProperty.call(settings, "glowIntensity")
    ) {
      canonical.glowIntensity = settings.glowIntensity;
    }

    return canonical;
  }

  function normalizeValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
      return undefined;
    }

    if (BOOLEAN_KEYS.includes(key)) {
      return Boolean(value);
    }

    if (RANGES[key]) {
      return clamp(value, RANGES[key].min, RANGES[key].max);
    }

    if (ENUMS[key]) {
      return ENUMS[key].includes(value) ? value : DEFAULTS[key];
    }

    if (COLOR_KEYS.includes(key)) {
      return normalizeColor(value);
    }

    if (key === "lastUpdated") {
      return Number.isFinite(value) ? value : null;
    }

    return value;
  }

  function validate(settings = {}) {
    const errors = [];
    const normalized = {};
    const incoming = normalizeIncomingSettings(settings);

    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return {
        valid: false,
        errors: ["Settings must be an object."],
        settings: { ...DEFAULTS },
      };
    }

    for (const key of Object.keys(DEFAULTS)) {
      const value = Object.prototype.hasOwnProperty.call(incoming, key)
        ? incoming[key]
        : DEFAULTS[key];

      if (BOOLEAN_KEYS.includes(key) && value !== undefined && value !== null && typeof value !== "boolean") {
        errors.push(`${key} must be a boolean.`);
      }

      if (RANGES[key] && value !== undefined && value !== null) {
        const numeric = Number(value);

        if (!Number.isFinite(numeric)) {
          errors.push(`${key} must be a number.`);
        } else if (numeric < RANGES[key].min || numeric > RANGES[key].max) {
          errors.push(`${key} must be between ${RANGES[key].min} and ${RANGES[key].max}.`);
        }
      }

      if (ENUMS[key] && value !== undefined && value !== null) {
        if (!ENUMS[key].includes(value)) {
          errors.push(`${key} must be one of: ${ENUMS[key].join(", ")}.`);
        }
      }

      if (
        COLOR_KEYS.includes(key) &&
        value !== null &&
        value !== "" &&
        !isHexColor(value)
      ) {
        errors.push(`${key} must be a valid HEX color.`);
      }

      normalized[key] = normalizeValue(key, value);
    }

    // Keep both frozen setting names compatible.
    const frozen = Boolean(normalized.frozen || normalized.freezeBackground);

    normalized.frozen = frozen;
    normalized.freezeBackground = frozen;

    if (normalized.hideShortsControls === undefined) {
      normalized.hideShortsControls = Boolean(normalized.hideShortsSidebar);
    }

    if (normalized.hideShortsSidebar === undefined) {
      normalized.hideShortsSidebar = Boolean(normalized.hideShortsControls);
    }

    return {
      valid: errors.length === 0,
      errors,
      settings: normalized,
    };
  }

  function normalize(settings = {}) {
    return validate(settings).settings;
  }

  function getDefaults() {
    return { ...DEFAULTS };
  }

  function getPreset(name) {
    if (!PRESETS[name]) {
      return null;
    }

    return {
      ...PRESETS[name],
    };
  }

  function applyPreset(name, currentSettings = {}) {
    const preset = getPreset(name);

    if (!preset) {
      throw new Error(`Unknown performance preset: ${name}`);
    }

    const merged = {
      ...currentSettings,
      ...preset,
    };

    return normalize(merged);
  }

  function getPresetNames() {
    return Object.keys(PRESETS);
  }

  function getRanges() {
    return JSON.parse(JSON.stringify(RANGES));
  }

  function getEnums() {
    return JSON.parse(JSON.stringify(ENUMS));
  }

  function update(currentSettings, updates) {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      throw new Error("Invalid settings update.");
    }

    return normalize({
      ...currentSettings,
      ...updates,
    });
  }

  function isValidKey(key) {
    return Object.prototype.hasOwnProperty.call(DEFAULTS, key);
  }

  AF.settings = {
    DEFAULTS,
    PRESETS,
    RANGES,
    ENUMS,

    validate,
    normalize,
    update,

    getDefaults,
    getPreset,
    applyPreset,
    getPresetNames,
    getRanges,
    getEnums,

    isHexColor,
    isValidKey,
    clamp,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DEFAULTS,
      PRESETS,
      RANGES,
      ENUMS,
      validate,
      normalize,
      update,
      getDefaults,
      getPreset,
      applyPreset,
      getPresetNames,
      getRanges,
      getEnums,
      isHexColor,
      isValidKey,
      clamp,
    };
  }
})();
