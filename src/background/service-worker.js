"use strict";

const COMMANDS = {
  TOGGLE_AMBIENT: "toggle-ambient-flow",
  TOGGLE_FOCUS: "toggle-focus-mode",
  FREEZE_BACKGROUND: "freeze-background",
};

// Find the active YouTube tab
async function getActiveYouTubeTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const tab = tabs[0];

  if (!tab || !tab.url) return null;

  if (
    !tab.url.startsWith("https://www.youtube.com/") &&
    !tab.url.startsWith("https://youtube.com/")
  ) {
    return null;
  }

  return tab;
}

// Send a message to the active YouTube tab
async function sendToYouTube(type, payload = {}) {
  const tab = await getActiveYouTubeTab();

  if (!tab) {
    return {
      success: false,
      error: "Open a YouTube tab first.",
    };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, {
      type,
      ...payload,
    });
  } catch (error) {
    return {
      success: false,
      error: "Ambient Flow is not ready on this YouTube page.",
    };
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    switch (command) {
      case COMMANDS.TOGGLE_AMBIENT:
        await sendToYouTube("TOGGLE_AMBIENT_FLOW");
        break;

      case COMMANDS.TOGGLE_FOCUS:
        await sendToYouTube("TOGGLE_FOCUS_MODE");
        break;

      case COMMANDS.FREEZE_BACKGROUND:
        await sendToYouTube("FREEZE_BACKGROUND");
        break;

      default:
        console.warn("[AmbientFlow] Unknown command:", command);
    }
  } catch (error) {
    console.error("[AmbientFlow] Command failed:", error);
  }
});

// Handle messages from popup and other extension contexts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "AMBIENT_FLOW_READY") {
    sendResponse({ success: true });
    return false;
  }

  if (message.target === "ACTIVE_YOUTUBE_TAB") {
    sendToYouTube(message.type, message.payload || {})
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message,
        });
      });

    return true;
  }

  return false;
});

// Extension installation and update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      enabled: true,
      autoStart: true,
      mode: "cinematic",
      performanceMode: "balanced",
    });

    console.info("[AmbientFlow] Extension installed.");
  }

  if (details.reason === "update") {
    console.info(
      "[AmbientFlow] Updated to version:",
      chrome.runtime.getManifest().version,
    );
  }
});

// Extension startup
chrome.runtime.onStartup.addListener(() => {
  console.info("[AmbientFlow] Background service worker started.");
});

console.info("[AmbientFlow] Service worker loaded.");
