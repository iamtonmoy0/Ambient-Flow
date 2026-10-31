/* ==========================================
   YOUTUBE AMBIENT FLOW
   Main Content Script Controller
========================================== */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class AmbientFlowController {
    constructor() {
      this.analyzer = AF.videoAnalyzer;

      this.initialized = false;
      this.destroyed = false;

      this.messageListener = null;
      this.keyListener = null;
      this.pageHideListener = null;

      this.handleMessage = this.handleMessage.bind(this);
      this.handleKeyboard = this.handleKeyboard.bind(this);
      this.handlePageHide = this.handlePageHide.bind(this);
    }

    /* ======================================
       INITIALIZATION
    ====================================== */

    async init() {
      if (this.initialized || this.destroyed) {
        return;
      }

      if (!this.analyzer) {
        console.error("[Ambient Flow] Video analyzer is unavailable.");
        return;
      }

      try {
        await this.analyzer.start();

        this.registerListeners();

        this.initialized = true;

        console.info("[Ambient Flow] Initialized successfully.");

        this.notifyReady();
      } catch (error) {
        console.error("[Ambient Flow] Initialization failed:", error);
      }
    }

    registerListeners() {
      if (this.messageListener) return;

      this.messageListener = this.handleMessage;

      chrome.runtime.onMessage.addListener(this.messageListener);

      this.keyListener = this.handleKeyboard;

      document.addEventListener("keydown", this.keyListener);

      this.pageHideListener = this.handlePageHide;

      window.addEventListener("pagehide", this.pageHideListener);
    }

    unregisterListeners() {
      if (this.messageListener) {
        chrome.runtime.onMessage.removeListener(this.messageListener);

        this.messageListener = null;
      }

      if (this.keyListener) {
        document.removeEventListener("keydown", this.keyListener);

        this.keyListener = null;
      }

      if (this.pageHideListener) {
        window.removeEventListener("pagehide", this.pageHideListener);

        this.pageHideListener = null;
      }
    }

    notifyReady() {
      try {
        chrome.runtime
          .sendMessage({
            type: "AMBIENT_FLOW_READY",
            status: this.getStatus(),
          })
          .catch(() => {
            // The background worker may not be listening.
          });
      } catch {
        // Ignore unavailable runtime messaging.
      }
    }

    /* ======================================
       STATUS
    ====================================== */

    getStatus() {
      return {
        initialized: this.initialized,
        ...this.analyzer.getStatus(),
      };
    }

    async getSettings() {
      return AF.storage.getAll();
    }

    /* ======================================
       MESSAGE HANDLING
    ====================================== */

    handleMessage(message, sender, sendResponse) {
      if (!message || typeof message.type !== "string") {
        return false;
      }

      const actions = {
        GET_STATUS: async () => ({
          success: true,
          status: this.getStatus(),
        }),

        GET_SETTINGS: async () => ({
          success: true,
          settings: await this.getSettings(),
        }),

        UPDATE_SETTINGS: async () => {
          await this.updateSettings(message.settings);

          return {
            success: true,
            status: this.getStatus(),
          };
        },

        TOGGLE_AMBIENT_FLOW: async () => {
          const enabled = await this.toggleAmbientFlow();

          return {
            success: true,
            enabled,
            status: this.getStatus(),
          };
        },

        TOGGLE_FOCUS_MODE: async () => {
          const enabled = await this.toggleFocusMode();

          return {
            success: true,
            enabled,
          };
        },

        FREEZE_BACKGROUND: async () => {
          const frozen = await this.freezeBackground();

          return {
            success: true,
            frozen,
          };
        },

        SET_CUSTOM_COLOR: async () => {
          const applied = await this.setCustomColor(message.color);

          return {
            success: applied,
            color: message.color,
          };
        },

        RESET_THEME: async () => {
          this.analyzer.restoreYouTube();

          return {
            success: true,
            message: "Original YouTube appearance restored.",
          };
        },
      };

      const action = actions[message.type];

      if (!action) return false;

      action()
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error?.message || "Action failed.",
          });
        });

      return true;
    }

    /* ======================================
       SETTINGS
    ====================================== */

    async updateSettings(settings = {}) {
      if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
      ) {
        throw new Error("Invalid settings object.");
      }

      const validated = AF.settings ? AF.settings.validate(settings) : settings;

      await AF.storage.set(validated);

      await this.analyzer.handleSettingsChange();

      return validated;
    }

    /* ======================================
       AMBIENT FLOW CONTROL
    ====================================== */

    async toggleAmbientFlow() {
      const settings = await AF.storage.getAll();

      const enabled = !settings.enabled;

      await AF.storage.set({ enabled });

      await this.analyzer.handleSettingsChange();

      if (!enabled) {
        this.analyzer.stopSampling();
        this.analyzer.restoreYouTube();
      } else {
        this.analyzer.syncPlaybackState();
      }

      return enabled;
    }

    /* ======================================
       FOCUS MODE
    ====================================== */

    async toggleFocusMode() {
      const current = AF.focusMode?.isEnabled?.() || false;

      const enabled = !current;

      if (enabled) {
        AF.focusMode?.enable();
      } else {
        AF.focusMode?.disable();
      }

      await AF.storage.set({
        focusMode: enabled,
      });

      return enabled;
    }

    /* ======================================
       FREEZE BACKGROUND
    ====================================== */

    async freezeBackground() {
      const settings = await AF.storage.getAll();

      const frozen = !settings.frozen;

      if (frozen) {
        const color =
          this.analyzer.lastColor || settings.lastColor || settings.customColor;

        if (color) {
          AF.themeEngine.freeze(color);
        }
      } else {
        AF.themeEngine.unfreeze();

        if (this.analyzer.isPlaying()) {
          this.analyzer.lastAppliedColor = null;
        }
      }

      await AF.storage.set({
        frozen,
        frozenColor: frozen
          ? this.analyzer.lastColor ||
            settings.lastColor ||
            settings.customColor
          : settings.frozenColor,
      });

      return frozen;
    }

    /* ======================================
       CUSTOM COLOR
    ====================================== */

    async setCustomColor(color) {
      if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error("Invalid hexadecimal color.");
      }

      if (!this.analyzer.isPlaying()) {
        throw new Error("Play a video before applying an ambient color.");
      }

      await AF.storage.set({
        customColor: color,
        frozen: true,
        frozenColor: color,
      });

      AF.themeEngine.freeze(color);

      this.analyzer.applyColor(color);

      return true;
    }

    /* ======================================
       KEYBOARD SHORTCUTS
    ====================================== */

    handleKeyboard(event) {
      if (!event.altKey || !event.shiftKey || event.repeat) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "a") {
        event.preventDefault();
        this.toggleAmbientFlow();
      }

      if (key === "f") {
        event.preventDefault();
        this.toggleFocusMode();
      }

      if (key === "c") {
        event.preventDefault();
        this.freezeBackground();
      }
    }

    /* ======================================
       PAGE CLEANUP
    ====================================== */

    handlePageHide() {
      this.analyzer.stopSampling();
      this.analyzer.restoreYouTube();
    }

    async destroy() {
      if (this.destroyed) return;

      this.destroyed = true;

      this.unregisterListeners();

      await this.analyzer.destroy();

      this.initialized = false;
    }
  }

  /* ======================================
     START APPLICATION
  ====================================== */

  const controller = new AmbientFlowController();

  AF.controller = controller;

  controller.init();

  // Expose a cleanup function for debugging.
  AF.destroy = () => controller.destroy();
})();
