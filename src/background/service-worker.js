/* ==========================================
   YOUTUBE AMBIENT FLOW
   Manifest V3 Service Worker
========================================== */

"use strict";

const DEFAULT_SETTINGS = {
  enabled: true,
  ambientGlow: true,
  focusMode: false,

  frozen: false,
  frozenColor: null,
  customColor: null,

  sampleInterval: 700,
  sceneThreshold: 18,
  sceneCooldown: 250,

  glowIntensity: 0.35,
  glowBlur: 90,

  backgroundStyle: "gradient",
  performanceMode: "balanced",
};

const SETTINGS_KEY = "ambientFlowSettings";

/* ==========================================
   STORAGE HELPERS
========================================== */

async function getSettings() {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEY);

    return {
      ...DEFAULT_SETTINGS,
      ...(result[SETTINGS_KEY] || {}),
    };
  } catch (error) {
    console.error("[Ambient Flow] Settings read failed:", error);

    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(updates = {}) {
  const current = await getSettings();

  const next = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({
    [SETTINGS_KEY]: next,
  });

  return next;
}

/* ==========================================
   TAB MESSAGE HELPERS
========================================== */

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return {
      success: false,
      error: "Content script unavailable.",
    };
  }
}

async function getActiveYouTubeTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  const tab = tabs[0];

  if (!tab || !tab.url || !/^https:\/\/(www\.)?youtube\.com\//i.test(tab.url)) {
    return null;
  }

  return tab;
}

/* ==========================================
   MESSAGE ROUTER
========================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "GET_SETTINGS": {
          sendResponse({
            success: true,
            settings: await getSettings(),
          });

          break;
        }

        case "UPDATE_SETTINGS": {
          const settings = await saveSettings(message.settings || {});

          const tab = await getActiveYouTubeTab();

          if (tab?.id !== undefined) {
            await sendToTab(tab.id, {
              type: "UPDATE_SETTINGS",
              settings,
            });
          }

          sendResponse({
            success: true,
            settings,
          });

          break;
        }

        case "GET_STATUS": {
          const tab = await getActiveYouTubeTab();

          if (!tab?.id) {
            sendResponse({
              success: true,
              status: {
                available: false,
                enabled: false,
                sampling: false,
              },
            });

            break;
          }

          const response = await sendToTab(tab.id, {
            type: "GET_STATUS",
          });

          sendResponse({
            success: true,
            status: response?.status || {
              available: false,
            },
          });

          break;
        }

        case "TOGGLE_AMBIENT_FLOW": {
          const current = await getSettings();

          const enabled =
            typeof message.enabled === "boolean"
              ? message.enabled
              : !current.enabled;

          const settings = await saveSettings({
            enabled,
          });

          const tab = await getActiveYouTubeTab();

          let response = null;

          if (tab?.id !== undefined) {
            response = await sendToTab(tab.id, {
              type: "TOGGLE_AMBIENT_FLOW",
              enabled,
            });
          }

          sendResponse({
            success: true,
            enabled,
            settings,
            response,
          });

          break;
        }

        case "TOGGLE_FOCUS_MODE": {
          const current = await getSettings();

          const enabled =
            typeof message.enabled === "boolean"
              ? message.enabled
              : !current.focusMode;

          const settings = await saveSettings({
            focusMode: enabled,
          });

          const tab = await getActiveYouTubeTab();

          let response = null;

          if (tab?.id !== undefined) {
            response = await sendToTab(tab.id, {
              type: "TOGGLE_FOCUS_MODE",
              enabled,
            });
          }

          sendResponse({
            success: true,
            enabled,
            settings,
            response,
          });

          break;
        }

        case "FREEZE_BACKGROUND": {
          const current = await getSettings();

          const frozen =
            typeof message.frozen === "boolean"
              ? message.frozen
              : !current.frozen;

          const settings = await saveSettings({
            frozen,
          });

          const tab = await getActiveYouTubeTab();

          let response = null;

          if (tab?.id !== undefined) {
            response = await sendToTab(tab.id, {
              type: "FREEZE_BACKGROUND",
              frozen,
            });
          }

          sendResponse({
            success: true,
            frozen,
            settings,
            response,
          });

          break;
        }

        case "SET_CUSTOM_COLOR": {
          const color = message.color;

          if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            throw new Error("Invalid color.");
          }

          const settings = await saveSettings({
            customColor: color,
            frozen: true,
            frozenColor: color,
          });

          const tab = await getActiveYouTubeTab();

          let response = null;

          if (tab?.id !== undefined) {
            response = await sendToTab(tab.id, {
              type: "SET_CUSTOM_COLOR",
              color,
            });
          }

          sendResponse({
            success: true,
            color,
            settings,
            response,
          });

          break;
        }

        case "RESET_THEME": {
          const settings = await saveSettings({
            frozen: false,
            frozenColor: null,
            customColor: null,
          });

          const tab = await getActiveYouTubeTab();

          let response = null;

          if (tab?.id !== undefined) {
            response = await sendToTab(tab.id, {
              type: "RESET_THEME",
            });
          }

          sendResponse({
            success: true,
            settings,
            response,
          });

          break;
        }

        default:
          sendResponse({
            success: false,
            error: "Unknown message type.",
          });
      }
    } catch (error) {
      console.error("[Ambient Flow] Service worker error:", error);

      sendResponse({
        success: false,
        error: error.message,
      });
    }
  })();

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
        [SETTINGS_KEY]: DEFAULT_SETTINGS,
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

  if (!tab.url || !/^https:\/\/(www\.)?youtube\.com\//i.test(tab.url)) {
    return;
  }

  const settings = await getSettings();

  console.info(
    "[Ambient Flow] YouTube tab loaded:",
    tabId,
    "Enabled:",
    settings.enabled,
  );
});

console.info("[Ambient Flow] Service worker loaded.");
