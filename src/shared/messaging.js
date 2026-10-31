/* ==========================================
   YOUTUBE AMBIENT FLOW
   Unified Messaging System
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class Messaging {
    constructor() {
      this.available =
        typeof chrome !== "undefined" && Boolean(chrome.runtime?.sendMessage);
    }

    /* ======================================
       AVAILABILITY
    ====================================== */

    isAvailable() {
      return this.available;
    }

    /* ======================================
       SEND TO BACKGROUND
    ====================================== */

    async send(message = {}) {
      if (!this.available) {
        throw new Error("Chrome extension messaging is unavailable.");
      }

      if (
        !message ||
        typeof message !== "object" ||
        typeof message.type !== "string"
      ) {
        throw new TypeError("A valid message type is required.");
      }

      try {
        const response = await chrome.runtime.sendMessage(message);

        if (!response) {
          throw new Error("The background service did not respond.");
        }

        if (response.success === false) {
          throw new Error(response.error || "Messaging request failed.");
        }

        return response;
      } catch (error) {
        console.error("[Ambient Flow] Messaging failed:", error);

        throw error;
      }
    }

    /* ======================================
       SEND TO CONTENT SCRIPT
    ====================================== */

    async sendToContent(message = {}, tabId = null) {
      if (typeof chrome === "undefined" || !chrome.tabs?.sendMessage) {
        throw new Error("Tab messaging is unavailable in this context.");
      }

      let targetTabId = tabId;

      if (targetTabId === null) {
        const tabs = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });

        targetTabId = tabs[0]?.id;
      }

      if (typeof targetTabId !== "number") {
        throw new Error("No active browser tab was found.");
      }

      return chrome.tabs.sendMessage(targetTabId, message);
    }

    /* ======================================
       SETTINGS
    ====================================== */

    async getSettings() {
      const response = await this.send({
        type: "GET_SETTINGS",
      });

      return response.settings;
    }

    async updateSettings(settings = {}) {
      const response = await this.send({
        type: "UPDATE_SETTINGS",
        settings,
      });

      return response.settings;
    }

    /* ======================================
       STATUS
    ====================================== */

    async getStatus() {
      const response = await this.send({
        type: "GET_STATUS",
      });

      return response.status;
    }

    /* ======================================
       AMBIENT FLOW
    ====================================== */

    async toggleAmbientFlow(enabled) {
      const response = await this.send({
        type: "TOGGLE_AMBIENT_FLOW",
        enabled,
      });

      return response.enabled;
    }

    /* ======================================
       FOCUS MODE
    ====================================== */

    async toggleFocusMode(enabled) {
      const response = await this.send({
        type: "TOGGLE_FOCUS_MODE",
        enabled,
      });

      return response.enabled;
    }

    /* ======================================
       FREEZE BACKGROUND
    ====================================== */

    async freezeBackground(frozen) {
      const response = await this.send({
        type: "FREEZE_BACKGROUND",
        frozen,
      });

      return response.frozen;
    }

    /* ======================================
       CUSTOM COLOR
    ====================================== */

    async setCustomColor(color) {
      if (!AF.settings?.isHexColor?.(color)) {
        throw new Error("Please provide a valid hexadecimal color.");
      }

      const response = await this.send({
        type: "SET_CUSTOM_COLOR",
        color,
      });

      return response.color;
    }

    /* ======================================
       RESET THEME
    ====================================== */

    async resetTheme() {
      const response = await this.send({
        type: "RESET_THEME",
      });

      return response.reset === true;
    }
  }

  /* ======================================
     GLOBAL INSTANCE
  ====================================== */

  AF.Messaging = Messaging;
  AF.messaging = new Messaging();
})();
