/**
 * YouTube Ambient Flow
 * Manifest V3 Service Worker
 *
 * Responsibilities:
 * - Manage extension settings
 * - Route popup messages to YouTube content scripts
 * - Retrieve live video status
 * - Handle ambient and focus mode controls
 * - Synchronize settings with active YouTube tabs
 */

"use strict";

const SETTINGS_KEY = "ambientFlowSettings";

const DEFAULT_SETTINGS = {
  enabled: true,
  ambientGlow: true,
  focusModeEnabled: false,

  hideSidebar: false,
  hideComments: false,
  hideRecommendations: false,
  hideChat: false,
  hideHeader: false,
  hideShortsControls: false,

  frozen: false,
  freezeBackground: false,
  frozenColor: null,
  customColor: null,

  samplingInterval: 700,
  sampleInterval: 700,
  sceneThreshold: 18,
  sceneCooldown: 250,

  glowIntensity: 65,
  glowBlur: 90,

  transitionDuration: 800,
  backgroundStyle: "gradient",
  performanceMode: "balanced",
};

const MESSAGE_TYPES = {
  GET_SETTINGS: "GET_SETTINGS",
  UPDATE_SETTINGS: "UPDATE_SETTINGS",
  GET_STATUS: "GET_STATUS",

  TOGGLE_AMBIENT_FLOW: "TOGGLE_AMBIENT_FLOW",
  TOGGLE_FOCUS_MODE: "TOGGLE_FOCUS_MODE",

  FREEZE_BACKGROUND: "FREEZE_BACKGROUND",
  SET_CUSTOM_COLOR: "SET_CUSTOM_COLOR",
  RESET_THEME: "RESET_THEME",
};

/* ==========================================
   GENERAL HELPERS
========================================== */

function isYouTubeUrl(url) {
  if (typeof url !== "string") return false;

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
        parsed.hostname,
      )
    );
  } catch {
    return false;
  }
}

function clamp(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, number));
}

function normalizeSettings(settings = {}) {
  const result = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };

  // Maintain compatibility with older settings.
  if (
    typeof settings.focusMode === "boolean" &&
    typeof settings.focusModeEnabled !== "boolean"
  ) {
    result.focusModeEnabled = settings.focusMode;
  }

  result.focusMode = result.focusModeEnabled;

  if (
    typeof settings.freezeBackground === "boolean" &&
    typeof settings.frozen !== "boolean"
  ) {
    result.frozen = settings.freezeBackground;
  }

  result.freezeBackground = result.frozen;

  if (
    typeof settings.samplingInterval !== "number" &&
    typeof settings.sampleInterval === "number"
  ) {
    result.samplingInterval = settings.sampleInterval;
  }

  result.sampleInterval = result.samplingInterval;

  if (!["battery", "balanced", "quality"].includes(result.performanceMode)) {
    result.performanceMode = "balanced";
  }

  result.samplingInterval = clamp(result.samplingInterval, 350, 4000, 700);

  result.sampleInterval = result.samplingInterval;

  result.sceneThreshold = clamp(result.sceneThreshold, 1, 100, 18);

  result.glowIntensity = clamp(result.glowIntensity, 0, 100, 65);

  result.transitionDuration = clamp(result.transitionDuration, 0, 5000, 800);

  return result;
}

/* ==========================================
   STORAGE HELPERS
========================================== */

async function getSettings() {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEY);

    const stored = result[SETTINGS_KEY] || {};

    return normalizeSettings(stored);
  } catch (error) {
    console.error("[Ambient Flow] Settings read failed:", error);

    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(updates = {}) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("Invalid settings object.");
  }

  const current = await getSettings();

  const next = normalizeSettings({
    ...current,
    ...updates,
  });

  await chrome.storage.local.set({
    [SETTINGS_KEY]: next,
  });

  return next;
}

/* ==========================================
   TAB HELPERS
========================================== */

/**
 * Get the active YouTube tab in the last-focused
 * browser window.
 */
async function getActiveYouTubeTab() {
  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({
      populate: false,
    });

    if (!lastFocusedWindow?.id) {
      return null;
    }

    const tabs = await chrome.tabs.query({
      active: true,
      windowId: lastFocusedWindow.id,
    });

    const youtubeTab = tabs.find((tab) =>
      isYouTubeUrl(tab.url || tab.pendingUrl),
    );

    return youtubeTab || null;
  } catch (error) {
    console.error("[Ambient Flow] Failed to find active YouTube tab:", error);

    return null;
  }
}

/**
 * Send a message to a content script.
 *
 * Retries once when the content script is temporarily
 * unavailable. It does not retry arbitrary message errors.
 */
async function sendToTab(tabId, message, options = {}) {
  const retries = options.retries ?? 1;
  const retryDelay = options.retryDelay ?? 300;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);

      return {
        success: true,
        response,
      };
    } catch (error) {
      const errorMessage = error?.message || String(error);

      console.warn("[Ambient Flow] Content script communication failed:", {
        tabId,
        messageType: message?.type,
        attempt: attempt + 1,
        error: errorMessage,
      });

      const isMissingReceiver =
        errorMessage.includes("Receiving end does not exist") ||
        errorMessage.includes("Could not establish connection");

      if (!isMissingReceiver || attempt >= retries) {
        return {
          success: false,
          error: errorMessage,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return {
    success: false,
    error: "Content script unavailable.",
  };
}

/**
 * Synchronize settings with the active YouTube tab.
 */
async function sendSettingsToActiveTab(settings) {
  const tab = await getActiveYouTubeTab();

  if (!tab) {
    return {
      success: false,
      error: "No active YouTube tab.",
    };
  }

  return sendToTab(tab.id, {
    type: MESSAGE_TYPES.UPDATE_SETTINGS,
    settings,
  });
}

/* ==========================================
   STATUS HELPERS
========================================== */

function createUnavailableStatus(settings = {}) {
  return {
    available: false,
    enabled: settings.enabled ?? false,

    hasVideo: false,
    isPlaying: false,
    isPaused: false,
    isEnded: false,

    analysisActive: false,
    sampling: false,
    isBlocked: false,

    videoTitle: null,
    currentColor: null,
    palette: null,

    performance: {},
  };
}

/**
 * Retrieve the actual status from the YouTube content script.
 */
async function getYouTubeStatus() {
  const settings = await getSettings();

  const tab = await getActiveYouTubeTab();

  if (!tab) {
    console.info("[Ambient Flow] No active YouTube tab.");

    return createUnavailableStatus(settings);
  }

  console.info("[Ambient Flow] Requesting video status:", {
    tabId: tab.id,
    url: tab.url,
  });

  const result = await sendToTab(
    tab.id,
    {
      type: MESSAGE_TYPES.GET_STATUS,
    },
    {
      retries: 1,
      retryDelay: 300,
    },
  );

  if (!result.success) {
    console.warn(
      "[Ambient Flow] Unable to retrieve YouTube status:",
      result.error,
    );

    return {
      ...createUnavailableStatus(settings),
      available: false,
      connectionError: result.error,
    };
  }

  const response = result.response;

  if (!response || response.success === false) {
    return {
      ...createUnavailableStatus(settings),
      available: false,
      connectionError: response?.error || "Invalid content script response.",
    };
  }

  // Content script normally responds:
  // { success: true, status: {...} }
  //
  // Also support a flattened response.
  const status = response.status || response;

  return {
    ...createUnavailableStatus(settings),
    ...status,

    available: typeof status.available === "boolean" ? status.available : true,

    enabled:
      typeof status.enabled === "boolean" ? status.enabled : settings.enabled,
  };
}

/* ==========================================
   MESSAGE RESPONSE HELPER
========================================== */

function respond(sendResponse, data) {
  try {
    sendResponse(data);
  } catch (error) {
    console.error("[Ambient Flow] Response delivery failed:", error);
  }
}

/* ==========================================
   MESSAGE ROUTER
========================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  (async () => {
    try {
      switch (message.type) {
        /* GET SETTINGS */

        case MESSAGE_TYPES.GET_SETTINGS: {
          const settings = await getSettings();

          respond(sendResponse, {
            success: true,
            settings,
          });

          break;
        }

        /* UPDATE SETTINGS */

        case MESSAGE_TYPES.UPDATE_SETTINGS: {
          const updates = message.settings || {};

          const settings = await saveSettings(updates);

          const tab = await getActiveYouTubeTab();

          let tabResponse = null;

          if (tab) {
            tabResponse = await sendToTab(tab.id, {
              type: MESSAGE_TYPES.UPDATE_SETTINGS,
              settings,
            });
          }

          respond(sendResponse, {
            success: true,
            settings,
            tabResponse,
          });

          break;
        }

        /* GET STATUS */

        case MESSAGE_TYPES.GET_STATUS: {
          const status = await getYouTubeStatus();

          respond(sendResponse, {
            success: true,
            ...status,
            status,
          });

          break;
        }

        /* TOGGLE AMBIENT FLOW */

        case MESSAGE_TYPES.TOGGLE_AMBIENT_FLOW: {
          const current = await getSettings();

          const enabled =
            typeof message.enabled === "boolean"
              ? message.enabled
              : !current.enabled;

          const settings = await saveSettings({
            enabled,
          });

          const tab = await getActiveYouTubeTab();

          let tabResponse = null;

          if (tab) {
            tabResponse = await sendToTab(tab.id, {
              type: MESSAGE_TYPES.TOGGLE_AMBIENT_FLOW,
              enabled,
            });
          }

          respond(sendResponse, {
            success: true,
            enabled,
            settings,
            tabResponse,
          });

          break;
        }

        /* TOGGLE FOCUS MODE */

        case MESSAGE_TYPES.TOGGLE_FOCUS_MODE: {
          const current = await getSettings();

          const enabled =
            typeof message.enabled === "boolean"
              ? message.enabled
              : !current.focusModeEnabled;

          const settings = await saveSettings({
            focusModeEnabled: enabled,
            focusMode: enabled,
          });

          const tab = await getActiveYouTubeTab();

          let tabResponse = null;

          if (tab) {
            tabResponse = await sendToTab(tab.id, {
              type: MESSAGE_TYPES.TOGGLE_FOCUS_MODE,
              enabled,
            });
          }

          respond(sendResponse, {
            success: true,
            enabled,
            settings,
            tabResponse,
          });

          break;
        }

        /* FREEZE BACKGROUND */

        case MESSAGE_TYPES.FREEZE_BACKGROUND: {
          const current = await getSettings();

          const frozen =
            typeof message.frozen === "boolean"
              ? message.frozen
              : !current.frozen;

          const updates = {
            frozen,
            freezeBackground: frozen,
          };

          if (typeof message.color === "string") {
            updates.frozenColor = message.color;
            updates.customColor = message.color;
          }

          const settings = await saveSettings(updates);

          const tab = await getActiveYouTubeTab();

          let tabResponse = null;

          if (tab) {
            tabResponse = await sendToTab(tab.id, {
              type: MESSAGE_TYPES.FREEZE_BACKGROUND,
              frozen,
              color: settings.frozenColor,
            });
          }

          respond(sendResponse, {
            success: true,
            frozen,
            settings,
            tabResponse,
          });

          break;
        }

        /* SET CUSTOM COLOR */

        case MESSAGE_TYPES.SET_CUSTOM_COLOR: {
          const color = message.color;

          if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            throw new Error("Invalid color.");
          }

          const settings = await saveSettings({
            customColor: color,
            frozenColor: color,
            frozen: true,
            freezeBackground: true,
          });

          const tab = await getActiveYouTubeTab();

          let tabResponse = null;

          if (tab) {
            tabResponse = await sendToTab(tab.id, {
              type: MESSAGE_TYPES.SET_CUSTOM_COLOR,
              color,
            });
          }

          respond(sendResponse, {
            success: true,
            color,
            settings,
            tabResponse,
          });

          break;
        }

        /* RESET THEME */

        case MESSAGE_TYPES.RESET_THEME: {
          const settings = await saveSettings({
            frozen: false,
            freezeBackground: false,
            frozenColor: null,
            customColor: null,
          });

          const tab = await getActiveYouTubeTab();

          let tabResponse = null;

          if (tab) {
            tabResponse = await sendToTab(tab.id, {
              type: MESSAGE_TYPES.RESET_THEME,
            });
          }

          respond(sendResponse, {
            success: true,
            settings,
            tabResponse,
          });

          break;
        }

        /* UNKNOWN MESSAGE */

        default: {
          respond(sendResponse, {
            success: false,
            error: `Unknown message type: ${message.type}`,
          });
        }
      }
    } catch (error) {
      console.error("[Ambient Flow] Service worker error:", error);

      respond(sendResponse, {
        success: false,
        error: error.message || "Internal extension error.",
      });
    }
  })();

  // Keep the response channel open for asynchronous work.
  return true;
});

/* ==========================================
   EXTENSION INSTALLATION
========================================== */

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await chrome.storage.local.get(SETTINGS_KEY);

    if (!existing[SETTINGS_KEY]) {
      await chrome.storage.local.set({
        [SETTINGS_KEY]: { ...DEFAULT_SETTINGS },
      });
    } else {
      const normalized = normalizeSettings(existing[SETTINGS_KEY]);

      await chrome.storage.local.set({
        [SETTINGS_KEY]: normalized,
      });
    }

    if (details.reason === "install") {
      console.info("[Ambient Flow] Extension installed.");
    }

    if (details.reason === "update") {
      console.info(
        "[Ambient Flow] Extension updated:",
        details.previousVersion,
      );
    }
  } catch (error) {
    console.error("[Ambient Flow] Installation setup failed:", error);
  }
});

/* ==========================================
   TAB NAVIGATION
========================================== */

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  if (!isYouTubeUrl(tab.url)) {
    return;
  }

  try {
    const settings = await getSettings();

    console.info(
      "[Ambient Flow] YouTube tab loaded:",
      tabId,
      "Enabled:",
      settings.enabled,
    );

    const result = await sendToTab(tabId, {
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      settings,
    });

    if (!result.success) {
      console.warn(
        "[Ambient Flow] Initial settings sync failed:",
        result.error,
      );
    }
  } catch (error) {
    console.error("[Ambient Flow] YouTube tab synchronization failed:", error);
  }
});

/* ==========================================
   TAB ACTIVATION
========================================== */

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (!isYouTubeUrl(tab.url)) {
      return;
    }

    const settings = await getSettings();

    const result = await sendToTab(tabId, {
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      settings,
    });

    if (!result.success) {
      console.warn("[Ambient Flow] Tab activation sync failed:", result.error);
    }
  } catch (error) {
    console.warn("[Ambient Flow] Tab activation sync failed:", error.message);
  }
});

/* ==========================================
   EXTENSION COMMANDS
========================================== */

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await getActiveYouTubeTab();

  if (!tab) {
    return;
  }

  if (command === "toggle-ambient-flow") {
    const settings = await getSettings();

    const enabled = !settings.enabled;

    await saveSettings({ enabled });

    await sendToTab(tab.id, {
      type: MESSAGE_TYPES.TOGGLE_AMBIENT_FLOW,
      enabled,
    });
  }

  if (command === "toggle-focus-mode") {
    const settings = await getSettings();

    const enabled = !settings.focusModeEnabled;

    await saveSettings({
      focusModeEnabled: enabled,
      focusMode: enabled,
    });

    await sendToTab(tab.id, {
      type: MESSAGE_TYPES.TOGGLE_FOCUS_MODE,
      enabled,
    });
  }

  if (command === "freeze-background") {
    const settings = await getSettings();

    const frozen = !settings.frozen;

    await saveSettings({
      frozen,
      freezeBackground: frozen,
    });

    await sendToTab(tab.id, {
      type: MESSAGE_TYPES.FREEZE_BACKGROUND,
      frozen,
    });
  }
});

console.info("[Ambient Flow] Service worker initialized.");
