/* ==========================================
   YOUTUBE AMBIENT FLOW
   Shared Messaging Utility
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const MESSAGE_TYPES = Object.freeze({
    GET_STATUS: "GET_STATUS",
    GET_SETTINGS: "GET_SETTINGS",
    UPDATE_SETTINGS: "UPDATE_SETTINGS",

    TOGGLE_AMBIENT_FLOW: "TOGGLE_AMBIENT_FLOW",
    TOGGLE_FOCUS_MODE: "TOGGLE_FOCUS_MODE",
    FREEZE_BACKGROUND: "FREEZE_BACKGROUND",

    SET_CUSTOM_COLOR: "SET_CUSTOM_COLOR",
    RESET_THEME: "RESET_THEME",

    AMBIENT_FLOW_READY: "AMBIENT_FLOW_READY",
    ACTIVE_YOUTUBE_TAB: "ACTIVE_YOUTUBE_TAB",
  });

  /**
   * Send a message to the extension runtime.
   */
  async function send(message) {
    if (!chrome?.runtime?.sendMessage) {
      throw new Error("Extension messaging is unavailable.");
    }

    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      throw new Error(error?.message || "Unable to send extension message.");
    }
  }

  /**
   * Send a message to a specific tab.
   */
  async function sendToTab(tabId, message) {
    if (!chrome?.tabs?.sendMessage) {
      throw new Error("Tab messaging is unavailable.");
    }

    if (!Number.isInteger(tabId)) {
      throw new Error("A valid tab ID is required.");
    }

    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      throw new Error(error?.message || "Unable to communicate with the tab.");
    }
  }

  /**
   * Find the active YouTube tab.
   */
  async function getActiveYouTubeTab() {
    if (!chrome?.tabs?.query) {
      throw new Error("Tab query API is unavailable.");
    }

    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    return (
      tabs.find((tab) => {
        if (!tab.url) return false;

        try {
          const url = new URL(tab.url);

          return (
            url.hostname === "youtube.com" ||
            url.hostname.endsWith(".youtube.com")
          );
        } catch {
          return false;
        }
      }) || null
    );
  }

  /**
   * Send a message to the active YouTube tab.
   */
  async function sendToActiveYouTubeTab(message) {
    const tab = await getActiveYouTubeTab();

    if (!tab?.id) {
      throw new Error("No active YouTube tab was found.");
    }

    return sendToTab(tab.id, message);
  }

  /**
   * Register a runtime message listener.
   *
   * The handler may return a value or a Promise.
   */
  function onMessage(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("Message handler must be a function.");
    }

    if (!chrome?.runtime?.onMessage) {
      return () => {};
    }

    const listener = (message, sender, sendResponse) => {
      try {
        const result = handler(message, sender);

        if (result && typeof result.then === "function") {
          result
            .then((response) => sendResponse(response))
            .catch((error) => {
              sendResponse({
                success: false,
                error: error?.message || "Message handling failed.",
              });
            });

          return true;
        }

        if (result !== undefined) {
          sendResponse(result);
        }
      } catch (error) {
        sendResponse({
          success: false,
          error: error?.message || "Message handling failed.",
        });
      }

      return false;
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }

  /**
   * Create a consistent response object.
   */
  function success(data = null, message = "Success") {
    return {
      success: true,
      message,
      data,
    };
  }

  function failure(error, code = "UNKNOWN_ERROR") {
    return {
      success: false,
      code,
      error:
        typeof error === "string"
          ? error
          : error?.message || "An unexpected error occurred.",
    };
  }

  AF.messaging = {
    MESSAGE_TYPES,
    send,
    sendToTab,
    getActiveYouTubeTab,
    sendToActiveYouTubeTab,
    onMessage,
    success,
    failure,
  };
})();
