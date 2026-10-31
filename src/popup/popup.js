"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (selector) => document.querySelector(selector);

  const elements = {
    enabled: $("#enabledToggle"),
    statusText: $("#statusText"),
    statusDescription: $("#statusDescription"),
    statusDot: $("#statusDot"),

    intensity: $("#intensity"),
    intensityValue: $("#intensityValue"),

    saturation: $("#saturation"),
    saturationValue: $("#saturationValue"),

    glow: $("#glowToggle"),
    focus: $("#focusToggle"),
    freeze: $("#freezeToggle"),
    scene: $("#sceneToggle"),

    customColor: $("#customColor"),
    colorValue: $("#colorValue"),

    applyColor: $("#applyColorButton"),
    settings: $("#settingsButton"),
    advanced: $("#advancedButton"),

    toast: $("#toast"),
  };

  const DEFAULTS = {
    enabled: true,
    mode: "cinematic",
    intensity: 68,
    saturation: 72,
    ambientGlow: true,
    focusMode: false,
    frozen: false,
    sceneDetection: true,
    customColor: "#243b55",
  };

  let settings = { ...DEFAULTS };
  let activeTab = null;
  let toastTimeout = null;

  // Show popup notification
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove("show");
    }, 2200);
  }

  // Get current active tab
  async function getYouTubeTab() {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const tab = tabs[0];

    if (!tab?.url) return null;

    try {
      const url = new URL(tab.url);

      if (
        url.hostname === "youtube.com" ||
        url.hostname === "www.youtube.com" ||
        url.hostname === "m.youtube.com"
      ) {
        return tab;
      }
    } catch {
      return null;
    }

    return null;
  }

  // Send a message to the content script
  async function sendToContent(type, payload = {}) {
    if (!activeTab?.id) {
      return {
        success: false,
        error: "Open YouTube first.",
      };
    }

    try {
      return await chrome.tabs.sendMessage(activeTab.id, {
        type,
        ...payload,
      });
    } catch (error) {
      return {
        success: false,
        error: "Refresh YouTube and try again.",
      };
    }
  }

  // Read saved settings
  async function loadSettings() {
    const stored = await chrome.storage.local.get(null);

    settings = {
      ...DEFAULTS,
      ...stored,
    };

    renderSettings();
  }

  // Update popup controls
  function renderSettings() {
    elements.enabled.checked = Boolean(settings.enabled);

    elements.intensity.value = settings.intensity;
    elements.intensityValue.textContent = `${settings.intensity}%`;

    elements.saturation.value = settings.saturation;
    elements.saturationValue.textContent = `${settings.saturation}%`;

    elements.glow.checked = Boolean(settings.ambientGlow);
    elements.focus.checked = Boolean(settings.focusMode);
    elements.freeze.checked = Boolean(settings.frozen);
    elements.scene.checked = Boolean(settings.sceneDetection);

    elements.customColor.value = settings.customColor || DEFAULTS.customColor;

    elements.colorValue.textContent = elements.customColor.value.toUpperCase();

    document.querySelectorAll(".mode-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === settings.mode);
    });

    updateStatus();
  }

  // Update connection/status display
  function updateStatus(status = null) {
    const enabled = Boolean(settings.enabled);

    elements.statusDot.className = "status-dot";

    if (!activeTab) {
      elements.statusText.textContent = "YouTube not detected";
      elements.statusDescription.textContent =
        "Open a YouTube video to get started.";

      elements.statusDot.classList.add("error");
      return;
    }

    if (!enabled) {
      elements.statusText.textContent = "Ambient Flow disabled";
      elements.statusDescription.textContent =
        "Turn it on to activate dynamic themes.";

      return;
    }

    if (status?.success && status.status) {
      const analyzer = status.status.analyzer;

      if (analyzer?.videoDetected) {
        elements.statusText.textContent = "Ambient Flow active";
        elements.statusDescription.textContent = analyzer.videoPaused
          ? "Video paused"
          : "Analyzing video colors";

        elements.statusDot.classList.add("active");
        return;
      }
    }

    elements.statusText.textContent = "Ambient Flow enabled";
    elements.statusDescription.textContent = "Waiting for a supported video.";

    elements.statusDot.classList.add("active");
  }

  // Save settings to Chrome storage
  async function saveSettings(values) {
    try {
      await chrome.storage.local.set(values);

      settings = {
        ...settings,
        ...values,
      };

      return true;
    } catch (error) {
      console.error("[AmbientFlow] Settings error:", error);
      showToast("Could not save settings.");
      return false;
    }
  }

  // Refresh status from content script
  async function refreshStatus() {
    if (!activeTab) {
      updateStatus();
      return;
    }

    const response = await sendToContent("GET_STATUS");

    updateStatus(response);
  }

  // Initialize popup
  async function initialize() {
    try {
      await loadSettings();

      activeTab = await getYouTubeTab();

      updateStatus();

      if (activeTab) {
        await refreshStatus();
      }
    } catch (error) {
      console.error("[AmbientFlow] Popup initialization:", error);
      showToast("Unable to initialize popup.");
    }
  }

  // Master toggle
  elements.enabled.addEventListener("change", async () => {
    const response = await sendToContent("TOGGLE_AMBIENT_FLOW");

    if (!response?.success) {
      elements.enabled.checked = settings.enabled;
      showToast(response?.error || "Could not toggle Ambient Flow.");
      return;
    }

    settings.enabled = response.enabled;

    await saveSettings({
      enabled: response.enabled,
    });

    updateStatus();

    showToast(
      response.enabled ? "Ambient Flow enabled." : "Ambient Flow disabled.",
    );
  });

  // Visual mode selection
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = button.dataset.mode;

      await saveSettings({ mode });

      renderSettings();

      showToast(`${mode} mode selected.`);
    });
  });

  // Ambient intensity
  elements.intensity.addEventListener("input", async () => {
    const intensity = Number(elements.intensity.value);

    elements.intensityValue.textContent = `${intensity}%`;

    await saveSettings({ intensity });
  });

  // Color saturation
  elements.saturation.addEventListener("input", async () => {
    const saturation = Number(elements.saturation.value);

    elements.saturationValue.textContent = `${saturation}%`;

    await saveSettings({ saturation });
  });

  // Ambient glow
  elements.glow.addEventListener("change", async () => {
    const ambientGlow = elements.glow.checked;

    await saveSettings({ ambientGlow });

    showToast(ambientGlow ? "Ambient glow enabled." : "Ambient glow disabled.");
  });

  // Focus mode
  elements.focus.addEventListener("change", async () => {
    const response = await sendToContent("TOGGLE_FOCUS_MODE");

    if (!response?.success) {
      elements.focus.checked = settings.focusMode;
      showToast(response?.error || "Could not toggle Focus Mode.");
      return;
    }

    settings.focusMode = response.enabled;

    await saveSettings({
      focusMode: response.enabled,
    });

    showToast(
      response.enabled ? "Focus Mode enabled." : "Focus Mode disabled.",
    );
  });

  // Freeze background
  elements.freeze.addEventListener("change", async () => {
    const response = await sendToContent("FREEZE_BACKGROUND");

    if (!response?.success) {
      elements.freeze.checked = settings.frozen;
      showToast(response?.error || "Could not freeze background.");
      return;
    }

    settings.frozen = !settings.frozen;

    await saveSettings({
      frozen: settings.frozen,
    });

    renderSettings();

    showToast(
      settings.frozen
        ? "Background color frozen."
        : "Background color unfrozen.",
    );
  });

  // Scene detection
  elements.scene.addEventListener("change", async () => {
    const sceneDetection = elements.scene.checked;

    await saveSettings({ sceneDetection });

    showToast(
      sceneDetection ? "Scene detection enabled." : "Scene detection disabled.",
    );
  });

  // Custom color preview
  elements.customColor.addEventListener("input", () => {
    elements.colorValue.textContent = elements.customColor.value.toUpperCase();
  });

  // Apply custom color
  elements.applyColor.addEventListener("click", async () => {
    const color = elements.customColor.value;

    const response = await sendToContent("SET_CUSTOM_COLOR", { color });

    if (!response?.success) {
      showToast(response?.error || "Could not apply color.");
      return;
    }

    await saveSettings({
      customColor: color,
      frozen: true,
      frozenColor: color,
    });

    renderSettings();

    showToast("Custom color applied.");
  });

  // Open advanced settings
  async function openSettings() {
    await chrome.runtime.openOptionsPage();
  }

  elements.settings.addEventListener("click", openSettings);
  elements.advanced.addEventListener("click", openSettings);

  // Listen for settings changes from other extension pages
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }

    renderSettings();
  });

  await initialize();
});
