/**
 * YouTube Ambient Flow
 * Options Page Controller
 */

(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true,
    ambientGlow: true,
    focusModeEnabled: false,

    performanceMode: "balanced",
    samplingInterval: 700,
    sceneThreshold: 18,

    glowIntensity: 65,
    transitionDuration: 800,

    hideSidebar: false,
    hideComments: false,
    hideRecommendations: false,
    hideChat: false,
    hideHeader: false,
    hideShortsControls: false,

    freezeBackground: false,
    customColor: "#202020",
  };

  const MESSAGE_TYPES = {
    GET_SETTINGS: "GET_SETTINGS",
    UPDATE_SETTINGS: "UPDATE_SETTINGS",
    RESET_THEME: "RESET_THEME",
  };

  const elements = {};

  let settings = { ...DEFAULT_SETTINGS };
  let isInitialized = false;
  let saveTimeout = null;

  const BOOLEAN_KEYS = [
    "enabled",
    "ambientGlow",
    "focusModeEnabled",
    "hideSidebar",
    "hideComments",
    "hideRecommendations",
    "hideChat",
    "hideHeader",
    "hideShortsControls",
    "freezeBackground",
  ];

  const NUMBER_RANGES = {
    samplingInterval: [350, 4000],
    sceneThreshold: [1, 100],
    glowIntensity: [0, 100],
    transitionDuration: [0, 5000],
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    const ids = [
      "enabled",
      "ambientGlow",
      "focusModeEnabled",
      "performanceMode",
      "samplingInterval",
      "samplingIntervalValue",
      "sceneThreshold",
      "sceneThresholdValue",
      "glowIntensity",
      "glowIntensityValue",
      "transitionDuration",
      "transitionDurationValue",
      "hideSidebar",
      "hideComments",
      "hideRecommendations",
      "hideChat",
      "hideHeader",
      "hideShortsControls",
      "freezeBackground",
      "customColor",
      "saveButton",
      "resetButton",
      "statusMessage",
      "loadingIndicator",
      "restoreDefaultsButton",
    ];

    ids.forEach((id) => {
      elements[id] = getElement(id);
    });
  }

  function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        reject(new Error("Extension runtime unavailable"));
        return;
      }

      chrome.runtime.sendMessage(
        {
          type,
          ...payload,
        },
        (response) => {
          const error = chrome.runtime.lastError;

          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(response);
        },
      );
    });
  }

  function showStatus(message, type = "success") {
    const element = elements.statusMessage;

    if (!element) return;

    element.textContent = message;
    element.dataset.type = type;
    element.hidden = false;
  }

  function hideStatus() {
    if (!elements.statusMessage) return;

    elements.statusMessage.hidden = true;
    elements.statusMessage.textContent = "";
  }

  function setLoading(loading) {
    if (elements.loadingIndicator) {
      elements.loadingIndicator.hidden = !loading;
    }

    document.body.classList.toggle("is-loading", Boolean(loading));
  }

  function normalizeSettings(input = {}) {
    const result = {
      ...DEFAULT_SETTINGS,
      ...input,
    };

    BOOLEAN_KEYS.forEach((key) => {
      result[key] = Boolean(result[key]);
    });

    Object.entries(NUMBER_RANGES).forEach(([key, range]) => {
      const value = Number(result[key]);

      result[key] = Number.isFinite(value)
        ? Math.max(range[0], Math.min(range[1], value))
        : DEFAULT_SETTINGS[key];
    });

    if (!["battery", "balanced", "quality"].includes(result.performanceMode)) {
      result.performanceMode = "balanced";
    }

    if (
      typeof result.customColor !== "string" ||
      !CSS.supports("color", result.customColor)
    ) {
      result.customColor = DEFAULT_SETTINGS.customColor;
    }

    return result;
  }

  async function loadSettings() {
    try {
      const response = await sendMessage(MESSAGE_TYPES.GET_SETTINGS);

      const source = response?.settings || response || {};

      settings = normalizeSettings(source);

      renderSettings();

      return settings;
    } catch (error) {
      console.error("[AmbientFlow] Settings load failed:", error);

      showStatus(
        "Could not load settings. Default values are displayed.",
        "error",
      );

      settings = normalizeSettings();

      renderSettings();

      return settings;
    }
  }

  function setCheckbox(id, value) {
    const element = elements[id];

    if (!element) return;

    element.checked = Boolean(value);
  }

  function setInputValue(id, value) {
    const element = elements[id];

    if (!element) return;

    element.value = String(value);
  }

  function renderRangeValue(id, value, suffix = "") {
    setInputValue(id, value);

    const output = elements[`${id}Value`];

    if (output) {
      output.textContent = `${value}${suffix}`;
    }
  }

  function renderSettings() {
    BOOLEAN_KEYS.forEach((key) => {
      setCheckbox(key, settings[key]);
    });

    setInputValue("performanceMode", settings.performanceMode);

    renderRangeValue("samplingInterval", settings.samplingInterval, " ms");

    renderRangeValue("sceneThreshold", settings.sceneThreshold);

    renderRangeValue("glowIntensity", settings.glowIntensity, "%");

    renderRangeValue("transitionDuration", settings.transitionDuration, " ms");

    setInputValue("customColor", settings.customColor);
  }

  function getControlValue(key, element) {
    if (BOOLEAN_KEYS.includes(key)) {
      return Boolean(element.checked);
    }

    if (Object.prototype.hasOwnProperty.call(NUMBER_RANGES, key)) {
      return Number(element.value);
    }

    return element.value;
  }

  function validateSetting(key, value) {
    if (BOOLEAN_KEYS.includes(key)) {
      return typeof value === "boolean";
    }

    if (Object.prototype.hasOwnProperty.call(NUMBER_RANGES, key)) {
      const [minimum, maximum] = NUMBER_RANGES[key];

      return Number.isFinite(value) && value >= minimum && value <= maximum;
    }

    if (key === "performanceMode") {
      return ["battery", "balanced", "quality"].includes(value);
    }

    if (key === "customColor") {
      return typeof value === "string" && CSS.supports("color", value);
    }

    return false;
  }

  async function saveSettings(updates, options = {}) {
    hideStatus();

    const validatedUpdates = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!validateSetting(key, value)) {
        showStatus(`Invalid value for ${key}.`, "error");

        return false;
      }

      validatedUpdates[key] = value;
    }

    const previousSettings = { ...settings };

    settings = normalizeSettings({
      ...settings,
      ...validatedUpdates,
    });

    renderSettings();

    try {
      const response = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, {
        settings: validatedUpdates,
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.settings) {
        settings = normalizeSettings(response.settings);
      }

      renderSettings();

      if (!options.silent) {
        showStatus("Settings saved successfully.");
      }

      return true;
    } catch (error) {
      settings = previousSettings;

      renderSettings();

      showStatus(error.message || "Could not save settings.", "error");

      return false;
    }
  }

  function scheduleSave(key, value) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      saveSettings({ [key]: value }, { silent: true });
    }, 350);
  }

  function bindBooleanControl(key) {
    const element = elements[key];

    if (!element) return;

    element.addEventListener("change", () => {
      saveSettings({
        [key]: Boolean(element.checked),
      });
    });
  }

  function bindRangeControl(key) {
    const element = elements[key];

    if (!element) return;

    element.addEventListener("input", () => {
      const value = Number(element.value);

      const suffix =
        key === "glowIntensity"
          ? "%"
          : key === "samplingInterval" || key === "transitionDuration"
            ? " ms"
            : "";

      const output = elements[`${key}Value`];

      if (output) {
        output.textContent = `${value}${suffix}`;
      }
    });

    element.addEventListener("change", () => {
      scheduleSave(key, Number(element.value));
    });
  }

  function bindSelectControl(key) {
    const element = elements[key];

    if (!element) return;

    element.addEventListener("change", () => {
      saveSettings({
        [key]: element.value,
      });
    });
  }

  function bindColorControl(key) {
    const element = elements[key];

    if (!element) return;

    element.addEventListener("input", () => {
      const color = element.value;

      document.documentElement.style.setProperty(
        "--options-preview-color",
        color,
      );
    });

    element.addEventListener("change", () => {
      saveSettings({
        [key]: element.value,
      });
    });
  }

  async function resetAllSettings() {
    const confirmed = window.confirm(
      "Restore all settings to their default values?",
    );

    if (!confirmed) return;

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    const previousSettings = { ...settings };

    settings = normalizeSettings();

    renderSettings();

    try {
      // Reset the active theme first.
      await sendMessage(MESSAGE_TYPES.RESET_THEME);

      // Persist all default settings.
      const response = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, {
        settings: { ...DEFAULT_SETTINGS },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.settings) {
        settings = normalizeSettings(response.settings);
      }

      renderSettings();

      showStatus("Default settings restored.");
    } catch (error) {
      settings = previousSettings;

      renderSettings();

      showStatus(error.message || "Could not restore defaults.", "error");
    }
  }

  function bindEvents() {
    BOOLEAN_KEYS.forEach(bindBooleanControl);

    [
      "samplingInterval",
      "sceneThreshold",
      "glowIntensity",
      "transitionDuration",
    ].forEach(bindRangeControl);

    bindSelectControl("performanceMode");

    bindColorControl("customColor");

    elements.saveButton?.addEventListener("click", async () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }

      const updates = {};

      Object.keys(DEFAULT_SETTINGS).forEach((key) => {
        const element = elements[key];

        if (element) {
          updates[key] = getControlValue(key, element);
        }
      });

      await saveSettings(updates);
    });

    elements.resetButton?.addEventListener("click", resetAllSettings);

    elements.restoreDefaultsButton?.addEventListener("click", resetAllSettings);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") return;

    const updates = {};

    Object.entries(changes).forEach(([key, change]) => {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
        updates[key] = change.newValue;
      }
    });

    if (!Object.keys(updates).length) return;

    settings = normalizeSettings({
      ...settings,
      ...updates,
    });

    renderSettings();
  }

  function initializeStorageListener() {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  async function initialize() {
    if (isInitialized) return;

    isInitialized = true;

    cacheElements();

    setLoading(true);

    bindEvents();

    initializeStorageListener();

    await loadSettings();

    setLoading(false);
  }

  document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
