"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    enabled: true,
    autoStart: true,
    mode: "cinematic",
    colorSource: "dominant",
    backgroundStyle: "gradient",
    intensity: 68,
    saturation: 72,
    blur: 54,
    transitionMs: 900,
    sampleInterval: 1000,
    performanceMode: "balanced",
    adaptivePerformance: true,
    sceneDetection: true,
    ambientGlow: true,
    readability: true,
    focusMode: false,
    shortsSupport: true,
    rememberChannelThemes: true,
    reducedMotion: false,
    frozen: false,
    frozenColor: "#243b55",
    customColor: "#243b55",
    lastColor: "#243b55",
    channelProfiles: {},
  };

  const SETTINGS_KEYS = Object.keys(DEFAULTS);

  const RANGE_CONTROLS = {
    intensity: {
      output: "intensityValue",
      suffix: "%",
    },
    saturation: {
      output: "saturationValue",
      suffix: "%",
    },
    blur: {
      output: "blurValue",
      suffix: "%",
    },
    transitionMs: {
      output: "transitionValue",
      suffix: " ms",
    },
  };

  const SELECT_CONTROLS = [
    "mode",
    "colorSource",
    "backgroundStyle",
    "performanceMode",
  ];

  const CHECKBOX_CONTROLS = [
    "enabled",
    "autoStart",
    "adaptivePerformance",
    "sceneDetection",
    "ambientGlow",
    "readability",
    "focusMode",
    "shortsSupport",
    "rememberChannelThemes",
    "reducedMotion",
  ];

  let currentSettings = { ...DEFAULTS };
  let toastTimeout = null;

  const saveButton = $("saveButton");
  const exportButton = $("exportButton");
  const importButton = $("importButton");
  const importFile = $("importFile");
  const resetButton = $("resetButton");
  const toast = $("toast");

  // Show notification
  function showToast(message, duration = 2500) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }

  // Read settings from Chrome storage
  async function loadSettings() {
    const stored = await chrome.storage.local.get(null);

    currentSettings = {
      ...DEFAULTS,
      ...stored,
    };

    renderSettings();
  }

  // Render settings in the interface
  function renderSettings() {
    for (const key of CHECKBOX_CONTROLS) {
      const element = $(key);

      if (element) {
        element.checked = Boolean(currentSettings[key]);
      }
    }

    for (const key of SELECT_CONTROLS) {
      const element = $(key);

      if (element) {
        element.value = currentSettings[key];
      }
    }

    for (const [key, config] of Object.entries(RANGE_CONTROLS)) {
      const element = $(key);
      const output = $(config.output);

      if (element) {
        element.value = currentSettings[key];
      }

      if (output) {
        output.textContent = `${currentSettings[key]}${config.suffix}`;
      }
    }
  }

  // Collect current form values
  function collectSettings() {
    const values = {};

    for (const key of CHECKBOX_CONTROLS) {
      const element = $(key);

      if (element) {
        values[key] = element.checked;
      }
    }

    for (const key of SELECT_CONTROLS) {
      const element = $(key);

      if (element) {
        values[key] = element.value;
      }
    }

    for (const key of Object.keys(RANGE_CONTROLS)) {
      const element = $(key);

      if (element) {
        values[key] = Number(element.value);
      }
    }

    return values;
  }

  // Validate configuration before saving
  function validateSettings(settings) {
    const allowedModes = ["cinematic", "minimal", "vibrant", "relax"];

    const allowedColorSources = ["dominant", "average"];

    const allowedBackgrounds = ["gradient", "radial", "solid", "linear"];

    const allowedPerformance = ["high", "balanced", "battery"];

    if (!allowedModes.includes(settings.mode)) {
      throw new Error("Invalid visual mode.");
    }

    if (!allowedColorSources.includes(settings.colorSource)) {
      throw new Error("Invalid color source.");
    }

    if (!allowedBackgrounds.includes(settings.backgroundStyle)) {
      throw new Error("Invalid background style.");
    }

    if (!allowedPerformance.includes(settings.performanceMode)) {
      throw new Error("Invalid performance profile.");
    }

    const ranges = {
      intensity: [0, 100],
      saturation: [0, 100],
      blur: [0, 100],
      transitionMs: [100, 2500],
    };

    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = Number(settings[key]);

      if (!Number.isFinite(value) || value < min || value > max) {
        throw new Error(`Invalid ${key} value.`);
      }
    }

    return true;
  }

  // Save settings
  async function saveSettings(values) {
    const updated = {
      ...currentSettings,
      ...values,
    };

    validateSettings(updated);

    // Save only known settings.
    const safeSettings = {};

    for (const key of SETTINGS_KEYS) {
      if (key in updated) {
        safeSettings[key] = updated[key];
      }
    }

    await chrome.storage.local.set(safeSettings);

    currentSettings = {
      ...DEFAULTS,
      ...safeSettings,
    };

    renderSettings();

    return true;
  }

  // Save button
  saveButton.addEventListener("click", async () => {
    try {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      const values = collectSettings();

      await saveSettings(values);

      showToast("Settings saved successfully.");
    } catch (error) {
      console.error("[AmbientFlow] Save error:", error);
      showToast(error.message || "Could not save settings.");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save Changes";
    }
  });

  // Update slider labels immediately
  for (const [key, config] of Object.entries(RANGE_CONTROLS)) {
    const element = $(key);
    const output = $(config.output);

    element.addEventListener("input", () => {
      output.textContent = `${element.value}${config.suffix}`;
    });
  }

  // Export settings as JSON
  exportButton.addEventListener("click", async () => {
    try {
      const stored = await chrome.storage.local.get(null);

      const exportData = {
        application: "YouTube Ambient Flow",
        version: chrome.runtime.getManifest().version,
        exportedAt: new Date().toISOString(),
        settings: {},
      };

      for (const key of SETTINGS_KEYS) {
        if (key in stored) {
          exportData.settings[key] = stored[key];
        } else {
          exportData.settings[key] = DEFAULTS[key];
        }
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = "ambient-flow-settings.json";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast("Settings exported successfully.");
    } catch (error) {
      console.error("[AmbientFlow] Export error:", error);
      showToast("Could not export settings.");
    }
  });

  // Open import file picker
  importButton.addEventListener("click", () => {
    importFile.click();
  });

  // Import settings from JSON
  importFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      if (file.size > 1024 * 1024) {
        throw new Error("File is too large. Maximum size is 1 MB.");
      }

      const text = await file.text();
      const parsed = JSON.parse(text);

      const imported = parsed.settings || parsed;

      if (
        !imported ||
        typeof imported !== "object" ||
        Array.isArray(imported)
      ) {
        throw new Error("Invalid settings file.");
      }

      const safeSettings = {};

      for (const key of SETTINGS_KEYS) {
        if (Object.prototype.hasOwnProperty.call(imported, key)) {
          safeSettings[key] = imported[key];
        }
      }

      if (Object.keys(safeSettings).length === 0) {
        throw new Error("No compatible settings found.");
      }

      const merged = {
        ...DEFAULTS,
        ...safeSettings,
      };

      validateSettings(merged);

      if (
        typeof merged.frozenColor !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(merged.frozenColor)
      ) {
        throw new Error("Invalid frozen color.");
      }

      if (
        typeof merged.customColor !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(merged.customColor)
      ) {
        throw new Error("Invalid custom color.");
      }

      if (
        typeof merged.lastColor !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(merged.lastColor)
      ) {
        throw new Error("Invalid last color.");
      }

      if (
        !merged.channelProfiles ||
        typeof merged.channelProfiles !== "object" ||
        Array.isArray(merged.channelProfiles)
      ) {
        throw new Error("Invalid channel profiles.");
      }

      await saveSettings(safeSettings);

      showToast("Settings imported successfully.");
    } catch (error) {
      console.error("[AmbientFlow] Import error:", error);
      showToast(error.message || "Could not import settings.", 4000);
    } finally {
      importFile.value = "";
    }
  });

  // Reset settings
  resetButton.addEventListener("click", async () => {
    const confirmed = confirm(
      "Are you sure you want to reset all Ambient Flow settings? " +
        "Your saved channel profiles will also be removed.",
    );

    if (!confirmed) return;

    try {
      await chrome.storage.local.clear();

      await chrome.storage.local.set(DEFAULTS);

      currentSettings = { ...DEFAULTS };

      renderSettings();

      showToast("All settings restored to defaults.");
    } catch (error) {
      console.error("[AmbientFlow] Reset error:", error);
      showToast("Could not reset settings.");
    }
  });

  // Highlight active navigation section
  function initializeNavigation() {
    const links = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".settings-section");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (!visible.length) return;

        const activeId = visible[0].target.id;

        links.forEach((link) => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === `#${activeId}`,
          );
        });
      },
      {
        rootMargin: "-10% 0px -65% 0px",
        threshold: [0, 0.2, 0.5],
      },
    );

    sections.forEach((section) => observer.observe(section));
  }

  // Listen for settings changes from popup
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) {
        currentSettings[key] =
          change.newValue === undefined ? DEFAULTS[key] : change.newValue;
      }
    }

    renderSettings();
  });

  // Initialize page
  async function initialize() {
    try {
      await loadSettings();
      initializeNavigation();

      console.info("[AmbientFlow] Options page ready.");
    } catch (error) {
      console.error("[AmbientFlow] Options initialization:", error);
      showToast("Could not load settings.");
    }
  }

  initialize();
});
