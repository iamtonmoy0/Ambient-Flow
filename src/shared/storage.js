/**
 * YouTube Ambient Flow
 * Storage Manager
 *
 * Centralized Chrome extension storage.
 * Supports persistent settings, validation, defaults,
 * and cross-context storage change notifications.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const STORAGE_KEY = "ambientFlowSettings";

  const DEFAULT_SETTINGS = {
    // Main feature
    enabled: true,

    // Frame analysis
    samplingInterval: 700,
    sceneDetection: true,
    sceneThreshold: 18,

    // Ambient appearance
    ambientGlow: true,
    smoothTransitions: true,
    backgroundStyle: "gradient",
    intensity: 0.65,
    blur: 80,

    // Performance
    performanceMode: "balanced",

    // Frozen color
    frozen: false,
    freezeBackground: false,
    frozenColor: null,

    // Focus Mode
    focusModeEnabled: false,
    hideSidebar: true,
    hideComments: false,
    hideRecommendations: false,
    hideChat: true,
    hideHeader: false,
    hideShortsSidebar: false,

    // Customization
    customColor: null,

    // Internal metadata
    lastDetectedColor: null,
    lastUpdated: null,
  };

  const VALID_ENUMS = {
    performanceMode: ["battery", "balanced", "quality"],

    backgroundStyle: ["gradient", "solid", "transparent"],
  };

  const NUMERIC_RANGES = {
    samplingInterval: [300, 3000],
    sceneThreshold: [1, 100],
    intensity: [0, 1],
    blur: [0, 200],
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
    "hideShortsSidebar",
  ];

  const COLOR_KEYS = ["frozenColor", "customColor", "lastDetectedColor"];

  class StorageManager {
    constructor() {
      this.listeners = new Set();
      this.initialized = false;
      this.changeListener = null;

      this.handleStorageChange = this.handleStorageChange.bind(this);

      this.initializeListener();
    }

    initializeListener() {
      if (
        this.initialized ||
        typeof chrome === "undefined" ||
        !chrome.storage?.onChanged
      ) {
        return;
      }

      this.changeListener = this.handleStorageChange;

      chrome.storage.onChanged.addListener(this.changeListener);

      this.initialized = true;
    }

    isAvailable() {
      return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
    }

    isValidColor(value) {
      return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    }

    sanitizeColor(value) {
      if (value === null || value === "") {
        return null;
      }

      return this.isValidColor(value) ? value : null;
    }

    normalizeValue(key, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
        return undefined;
      }

      if (BOOLEAN_KEYS.includes(key)) {
        return Boolean(value);
      }

      if (Object.prototype.hasOwnProperty.call(NUMERIC_RANGES, key)) {
        const [minimum, maximum] = NUMERIC_RANGES[key];

        const number = Number(value);

        if (!Number.isFinite(number)) {
          return DEFAULT_SETTINGS[key];
        }

        return Math.max(minimum, Math.min(maximum, number));
      }

      if (Object.prototype.hasOwnProperty.call(VALID_ENUMS, key)) {
        return VALID_ENUMS[key].includes(value) ? value : DEFAULT_SETTINGS[key];
      }

      if (COLOR_KEYS.includes(key)) {
        return this.sanitizeColor(value);
      }

      if (key === "lastUpdated") {
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : null;
      }

      return value;
    }

    validateSettings(settings = {}) {
      const result = {};

      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const value = Object.prototype.hasOwnProperty.call(settings, key)
          ? settings[key]
          : DEFAULT_SETTINGS[key];

        result[key] = this.normalizeValue(key, value);
      }

      // Keep frozen and freezeBackground synchronized.
      const frozen = Boolean(result.frozen || result.freezeBackground);

      result.frozen = frozen;
      result.freezeBackground = frozen;

      return result;
    }

    async getAll() {
      if (!this.isAvailable()) {
        return { ...DEFAULT_SETTINGS };
      }

      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);

        const savedSettings = stored?.[STORAGE_KEY] || {};

        return this.validateSettings({
          ...DEFAULT_SETTINGS,
          ...savedSettings,
        });
      } catch (error) {
        console.error("[Ambient Flow] Storage read failed:", error);

        return { ...DEFAULT_SETTINGS };
      }
    }

    async get(key, fallback = undefined) {
      const settings = await this.getAll();

      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        return settings[key];
      }

      return fallback;
    }

    async set(updates = {}) {
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        throw new Error("Invalid settings update.");
      }

      if (!this.isAvailable()) {
        throw new Error("Chrome storage is unavailable.");
      }

      const current = await this.getAll();

      const merged = {
        ...current,
        ...updates,
        lastUpdated: Date.now(),
      };

      const validated = this.validateSettings(merged);

      await chrome.storage.local.set({
        [STORAGE_KEY]: validated,
      });

      return validated;
    }

    async reset() {
      if (!this.isAvailable()) {
        throw new Error("Chrome storage is unavailable.");
      }

      const defaults = {
        ...DEFAULT_SETTINGS,
        lastUpdated: Date.now(),
      };

      await chrome.storage.local.set({
        [STORAGE_KEY]: defaults,
      });

      return defaults;
    }

    onChanged(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    handleStorageChange(changes, areaName) {
      if (areaName !== "local" || !changes?.[STORAGE_KEY]) {
        return;
      }

      const change = changes[STORAGE_KEY];

      const event = {
        oldValue: this.validateSettings(change.oldValue || DEFAULT_SETTINGS),

        newValue: this.validateSettings(change.newValue || DEFAULT_SETTINGS),

        timestamp: Date.now(),
      };

      this.listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error("[Ambient Flow] Storage listener error:", error);
        }
      });
    }

    destroy() {
      if (
        this.initialized &&
        this.changeListener &&
        typeof chrome !== "undefined" &&
        chrome.storage?.onChanged
      ) {
        chrome.storage.onChanged.removeListener(this.changeListener);
      }

      this.listeners.clear();
      this.initialized = false;
      this.changeListener = null;
    }
  }

  AF.STORAGE_KEY = STORAGE_KEY;
  AF.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  AF.StorageManager = StorageManager;

  AF.storage = AF.storage || new StorageManager();
})();
