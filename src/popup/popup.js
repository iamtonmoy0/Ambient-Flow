/**
 * YouTube Ambient Flow
 * Popup Controller
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
  };

  const MESSAGE_TYPES = {
    GET_STATUS: "GET_STATUS",
    GET_SETTINGS: "GET_SETTINGS",
    UPDATE_SETTINGS: "UPDATE_SETTINGS",
    TOGGLE_AMBIENT_FLOW: "TOGGLE_AMBIENT_FLOW",
    TOGGLE_FOCUS_MODE: "TOGGLE_FOCUS_MODE",
    RESET_THEME: "RESET_THEME",
  };

  const elements = {};

  let settings = { ...DEFAULT_SETTINGS };
  let status = null;
  let isInitialized = false;
  let refreshTimer = null;

  function getElement(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    const ids = [
      "masterToggle",
      "ambientStatus",
      "statusText",
      "statusIndicator",
      "currentColor",
      "currentColorText",
      "focusToggle",
      "performanceMode",
      "glowIntensity",
      "glowIntensityValue",
      "resetButton",
      "settingsButton",
      "optionsButton",
      "videoTitle",
      "videoStatus",
      "samplingInterval",
      "sceneStatus",
      "errorMessage",
      "loadingIndicator",
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

  function setText(element, value) {
    if (!element) return;

    element.textContent = value ?? "";
  }

  function showError(message) {
    if (!elements.errorMessage) return;

    elements.errorMessage.textContent = message;
    elements.errorMessage.hidden = false;
  }

  function clearError() {
    if (!elements.errorMessage) return;

    elements.errorMessage.textContent = "";
    elements.errorMessage.hidden = true;
  }

  function setLoading(loading) {
    if (elements.loadingIndicator) {
      elements.loadingIndicator.hidden = !loading;
    }

    document.body.classList.toggle("is-loading", Boolean(loading));
  }

  function updateMasterToggle(enabled) {
    if (!elements.masterToggle) return;

    elements.masterToggle.checked = Boolean(enabled);

    elements.masterToggle.setAttribute(
      "aria-checked",
      String(Boolean(enabled)),
    );
  }

  function updateFocusToggle(enabled) {
    if (!elements.focusToggle) return;

    elements.focusToggle.checked = Boolean(enabled);
  }

  function updateStatusIndicator(active, text) {
    if (elements.statusIndicator) {
      elements.statusIndicator.classList.toggle("active", Boolean(active));

      elements.statusIndicator.classList.toggle("inactive", !active);
    }

    setText(elements.statusText, text);
    setText(elements.ambientStatus, text);
  }

  function updateColor(color) {
    if (!color) return;

    const validColor =
      typeof color === "string" && CSS.supports("color", color);

    if (!validColor) return;

    if (elements.currentColor) {
      elements.currentColor.style.backgroundColor = color;
    }

    setText(elements.currentColorText, color);
  }

  function updateVideoInformation(video = {}) {
    setText(elements.videoTitle, video.title || "No active video");

    let videoStatus = "No video detected";

    if (video.isPlaying) {
      videoStatus = "Playing";
    } else if (video.isPaused) {
      videoStatus = "Paused";
    } else if (video.isEnded) {
      videoStatus = "Ended";
    } else if (video.isBlocked) {
      videoStatus = "Frame access unavailable";
    } else if (video.exists) {
      videoStatus = "Video detected";
    }

    setText(elements.videoStatus, videoStatus);
  }

  function updatePerformanceInformation(performance = {}) {
    if (performance.currentInterval) {
      setText(elements.samplingInterval, `${performance.currentInterval} ms`);
    }

    if (elements.sceneStatus) {
      setText(
        elements.sceneStatus,
        performance.sceneChanges != null
          ? String(performance.sceneChanges)
          : "0",
      );
    }
  }

  function renderSettings() {
    updateMasterToggle(settings.enabled);
    updateFocusToggle(settings.focusModeEnabled);

    if (elements.performanceMode) {
      elements.performanceMode.value = settings.performanceMode || "balanced";
    }

    if (elements.glowIntensity) {
      elements.glowIntensity.value = settings.glowIntensity ?? 65;
    }

    setText(elements.glowIntensityValue, `${settings.glowIntensity ?? 65}%`);
  }

  function renderStatus(data = {}) {
    status = data;

    const enabled = data.enabled ?? settings.enabled;

    const playing = Boolean(data.isPlaying);

    const active = Boolean(enabled && (playing || data.analysisActive));

    let label = "Disabled";

    if (!enabled) {
      label = "Ambient flow disabled";
    } else if (data.isBlocked) {
      label = "Video frame access blocked";
    } else if (playing && data.analysisActive) {
      label = "Analyzing video";
    } else if (playing) {
      label = "Waiting for video analysis";
    } else if (data.isPaused) {
      label = "Paused";
    } else {
      label = "Waiting for video";
    }

    updateStatusIndicator(active, label);

    updateVideoInformation({
      exists: data.hasVideo,
      title: data.videoTitle,
      isPlaying: data.isPlaying,
      isPaused: data.isPaused,
      isEnded: data.isEnded,
      isBlocked: data.isBlocked,
    });

    updatePerformanceInformation(data.performance || {});

    updateColor(data.currentColor || data.palette?.primary);
  }

  async function loadSettings() {
    try {
      const response = await sendMessage(MESSAGE_TYPES.GET_SETTINGS);

      if (response?.settings) {
        settings = {
          ...DEFAULT_SETTINGS,
          ...response.settings,
        };
      } else if (response && !response.error) {
        settings = {
          ...DEFAULT_SETTINGS,
          ...response,
        };
      }

      renderSettings();

      return settings;
    } catch (error) {
      console.warn("[AmbientFlow] Could not load settings:", error);

      return settings;
    }
  }

  async function loadStatus() {
    try {
      const response = await sendMessage(MESSAGE_TYPES.GET_STATUS);

      if (response) {
        renderStatus(response);
      }

      return response;
    } catch (error) {
      renderStatus({
        enabled: settings.enabled,
        isPlaying: false,
        hasVideo: false,
      });

      return null;
    }
  }

  async function updateSetting(key, value) {
    clearError();

    const previous = settings[key];

    settings[key] = value;
    renderSettings();

    try {
      const response = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, {
        settings: {
          [key]: value,
        },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.settings) {
        settings = {
          ...DEFAULT_SETTINGS,
          ...response.settings,
        };
      }

      renderSettings();

      return true;
    } catch (error) {
      settings[key] = previous;
      renderSettings();

      showError(error.message || "Could not update settings");

      return false;
    }
  }

  async function toggleAmbientFlow(enabled) {
    clearError();

    const previous = settings.enabled;

    settings.enabled = enabled;
    renderSettings();

    try {
      const response = await sendMessage(MESSAGE_TYPES.TOGGLE_AMBIENT_FLOW, {
        enabled,
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (typeof response?.enabled === "boolean") {
        settings.enabled = response.enabled;
      }

      renderSettings();
      await loadStatus();

      return true;
    } catch (error) {
      settings.enabled = previous;
      renderSettings();

      showError(error.message || "Could not toggle ambient flow");

      return false;
    }
  }

  async function toggleFocusMode(enabled) {
    clearError();

    const previous = settings.focusModeEnabled;

    settings.focusModeEnabled = enabled;
    renderSettings();

    try {
      const response = await sendMessage(MESSAGE_TYPES.TOGGLE_FOCUS_MODE, {
        enabled,
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (typeof response?.enabled === "boolean") {
        settings.focusModeEnabled = response.enabled;
      }

      renderSettings();

      return true;
    } catch (error) {
      settings.focusModeEnabled = previous;
      renderSettings();

      showError(error.message || "Could not toggle focus mode");

      return false;
    }
  }

  async function resetTheme() {
    clearError();

    if (elements.resetButton) {
      elements.resetButton.disabled = true;
    }

    try {
      const response = await sendMessage(MESSAGE_TYPES.RESET_THEME);

      if (response?.error) {
        throw new Error(response.error);
      }

      await loadStatus();
    } catch (error) {
      showError(error.message || "Could not reset theme");
    } finally {
      if (elements.resetButton) {
        elements.resetButton.disabled = false;
      }
    }
  }

  function openOptions() {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  }

  function bindEvents() {
    elements.masterToggle?.addEventListener("change", (event) => {
      toggleAmbientFlow(event.target.checked);
    });

    elements.focusToggle?.addEventListener("change", (event) => {
      toggleFocusMode(event.target.checked);
    });

    elements.performanceMode?.addEventListener("change", (event) => {
      updateSetting("performanceMode", event.target.value);
    });

    elements.glowIntensity?.addEventListener("input", (event) => {
      const value = Number(event.target.value);

      setText(elements.glowIntensityValue, `${value}%`);
    });

    elements.glowIntensity?.addEventListener("change", (event) => {
      updateSetting("glowIntensity", Number(event.target.value));
    });

    elements.resetButton?.addEventListener("click", resetTheme);

    elements.settingsButton?.addEventListener("click", openOptions);

    elements.optionsButton?.addEventListener("click", openOptions);
  }

  function startAutoRefresh() {
    stopAutoRefresh();

    refreshTimer = setInterval(() => {
      if (!document.hidden) {
        loadStatus();
      }
    }, 2000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      loadStatus();
      startAutoRefresh();
    }
  }

  async function initialize() {
    if (isInitialized) return;

    isInitialized = true;

    cacheElements();
    setLoading(true);

    bindEvents();

    await loadSettings();
    await loadStatus();

    setLoading(false);

    startAutoRefresh();

    document.addEventListener("visibilitychange", handleVisibilityChange);

    window.addEventListener("unload", stopAutoRefresh);
  }

  document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
