/**
 * YouTube Ambient Flow
 * Main Content Script Controller
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  class AmbientFlowController {
    constructor() {
      this.initialized = false;
      this.messageListener = null;
      this.boundKeyHandler = this.handleKeyboard.bind(this);
      this.boundPageHide = this.handlePageHide.bind(this);

      this.focusSettings = {
        hideSidebar: true,
        hideComments: false,
        hideRecommendations: false,
        hideChat: true,
        hideHeader: false,
        hideShortsSidebar: false,
      };
    }

    async init() {
      if (this.initialized) return;

      this.initialized = true;

      this.registerMessageListener();

      window.addEventListener("keydown", this.boundKeyHandler);

      window.addEventListener("pagehide", this.boundPageHide);

      try {
        await AF.videoAnalyzer?.start?.();

        const settings = await this.getSettings();

        if (settings.focusModeEnabled) {
          AF.focusMode?.enable?.(this.focusSettings);
        }

        console.info("[Ambient Flow] Controller initialized.");
      } catch (error) {
        console.error("[Ambient Flow] Initialization failed:", error);
      }
    }

    registerMessageListener() {
      if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
        return;
      }

      this.messageListener = (message, sender, sendResponse) => {
        if (!message?.type) return false;

        this.handleMessage(message)
          .then((response) => {
            sendResponse({
              success: true,
              ...response,
            });
          })
          .catch((error) => {
            console.error("[Ambient Flow] Message handling failed:", error);

            sendResponse({
              success: false,
              error: error.message || "Operation failed",
            });
          });

        // Keep the message channel open for the asynchronous response.
        return true;
      };

      chrome.runtime.onMessage.addListener(this.messageListener);
    }

    async handleMessage(message) {
      switch (message.type) {
        case "GET_STATUS":
          return this.getStatus();

        case "GET_SETTINGS":
          return {
            settings: await this.getSettings(),
          };

        case "UPDATE_SETTINGS":
          return this.updateSettings(message.settings || {});

        case "TOGGLE_AMBIENT_FLOW":
          return this.toggleAmbientFlow(message.enabled);

        case "TOGGLE_FOCUS_MODE":
          return this.toggleFocusMode(message.enabled);

        case "UPDATE_FOCUS_SETTINGS":
          return this.updateFocusSettings(message.settings || {});

        case "FREEZE_BACKGROUND":
          return this.freezeBackground(message);

        case "SET_CUSTOM_COLOR":
          return this.setCustomColor(message.color);

        case "RESET_THEME":
          return this.resetTheme();

        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    }

    async getSettings() {
      const defaults = AF.DEFAULT_SETTINGS || {};

      try {
        const stored = await AF.storage?.getAll?.();

        return {
          ...defaults,
          ...(stored || {}),
        };
      } catch (error) {
        console.warn("[Ambient Flow] Could not retrieve settings:", error);

        return { ...defaults };
      }
    }

    async updateSettings(newSettings) {
      if (
        !newSettings ||
        typeof newSettings !== "object" ||
        Array.isArray(newSettings)
      ) {
        throw new Error("Invalid settings object.");
      }

      let sanitized = newSettings;

      if (AF.settings?.validate) {
        const validation = AF.settings.validate(newSettings);

        if (!validation.valid) {
          throw new Error(
            validation.errors?.join(", ") || "Settings validation failed.",
          );
        }

        sanitized = validation.settings;
      }

      if (!AF.storage?.set) {
        throw new Error("Storage manager is unavailable.");
      }

      await AF.storage.set(sanitized);

      await AF.videoAnalyzer?.handleSettingsChange?.(await this.getSettings());

      return {
        message: "Settings updated.",
        settings: await this.getSettings(),
      };
    }

    async toggleAmbientFlow(enabled) {
      const current = await this.getSettings();

      const nextEnabled =
        typeof enabled === "boolean" ? enabled : !current.enabled;

      await AF.storage?.set?.({
        enabled: nextEnabled,
      });

      AF.videoAnalyzer?.setEnabled?.(nextEnabled);

      if (!nextEnabled) {
        AF.videoAnalyzer?.stopSampling?.();
        AF.ambientGlow?.hide?.();
        AF.themeEngine?.reset?.();
      }

      return {
        enabled: nextEnabled,
      };
    }

    async toggleFocusMode(enabled) {
      const current = await this.getSettings();

      const nextEnabled =
        typeof enabled === "boolean"
          ? enabled
          : !Boolean(current.focusModeEnabled);

      if (nextEnabled) {
        AF.focusMode?.enable?.(this.focusSettings);
      } else {
        AF.focusMode?.disable?.();
      }

      await AF.storage?.set?.({
        focusModeEnabled: nextEnabled,
      });

      return {
        focusModeEnabled: nextEnabled,
        focusMode: AF.focusMode?.getStatus?.(),
      };
    }

    updateFocusSettings(settings) {
      if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
      ) {
        throw new Error("Invalid Focus Mode settings.");
      }

      const allowedKeys = Object.keys(this.focusSettings);

      for (const [key, value] of Object.entries(settings)) {
        if (!allowedKeys.includes(key)) continue;

        this.focusSettings[key] = Boolean(value);
      }

      AF.focusMode?.updateSettings?.(this.focusSettings);

      return {
        focusMode: AF.focusMode?.getStatus?.(),
      };
    }

    async freezeBackground(message) {
      const current = await this.getSettings();

      const frozen =
        typeof message.frozen === "boolean"
          ? message.frozen
          : !Boolean(current.frozen);

      const color = message.color || current.frozenColor || null;

      await AF.storage?.set?.({
        frozen,
        frozenColor: frozen ? color : null,
      });

      if (frozen && color) {
        AF.themeEngine?.freeze?.(color);

        const rgb = this.hexToRgb(color);

        if (rgb && AF.videoAnalyzer?.isPlaying) {
          AF.videoAnalyzer.applyColor(rgb);
        }
      } else {
        AF.themeEngine?.unfreeze?.();
      }

      await AF.videoAnalyzer?.handleSettingsChange?.(await this.getSettings());

      return {
        frozen,
        frozenColor: frozen ? color : null,
      };
    }

    async setCustomColor(color) {
      if (!AF.settings?.isHexColor?.(color)) {
        throw new Error("Invalid color. Use a valid HEX color.");
      }

      await AF.storage?.set?.({
        frozen: true,
        frozenColor: color,
      });

      AF.themeEngine?.freeze?.(color);

      const rgb = this.hexToRgb(color);

      if (rgb && AF.videoAnalyzer?.isPlaying) {
        AF.videoAnalyzer.applyColor(rgb);
      }

      return {
        frozen: true,
        color,
      };
    }

    async resetTheme() {
      AF.videoAnalyzer?.stopSampling?.();

      AF.themeEngine?.unfreeze?.();
      AF.themeEngine?.reset?.();
      AF.ambientGlow?.hide?.();

      await AF.storage?.set?.({
        frozen: false,
        frozenColor: null,
      });

      AF.videoAnalyzer?.syncPlaybackState?.();

      return {
        message: "Theme reset.",
      };
    }

    hexToRgb(hex) {
      if (typeof hex !== "string") return null;

      const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

      if (!match) return null;

      return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
      };
    }

    async getStatus() {
      const settings = await this.getSettings();

      return {
        initialized: this.initialized,
        settings,
        analyzer: AF.videoAnalyzer?.getStatus?.() || null,
        focusMode: AF.focusMode?.getStatus?.() || null,
        shorts: AF.shortsSupport?.getStatus?.() || null,
      };
    }

    handleKeyboard(event) {
      if (!event.altKey || !event.shiftKey) {
        return;
      }

      // Alt + Shift + A: Toggle Ambient Flow.
      if (event.code === "KeyA") {
        event.preventDefault();
        this.toggleAmbientFlow();
      }

      // Alt + Shift + F: Toggle Focus Mode.
      if (event.code === "KeyF") {
        event.preventDefault();
        this.toggleFocusMode();
      }

      // Alt + Shift + C: Reset ambient theme.
      if (event.code === "KeyC") {
        event.preventDefault();
        this.resetTheme();
      }
    }

    handlePageHide() {
      AF.videoAnalyzer?.stop?.();
      AF.ambientGlow?.hide?.();
      AF.themeEngine?.reset?.();
    }

    destroy() {
      if (!this.initialized) return;

      this.initialized = false;

      window.removeEventListener("keydown", this.boundKeyHandler);

      window.removeEventListener("pagehide", this.boundPageHide);

      if (
        this.messageListener &&
        typeof chrome !== "undefined" &&
        chrome.runtime?.onMessage
      ) {
        chrome.runtime.onMessage.removeListener(this.messageListener);
      }

      AF.videoAnalyzer?.destroy?.();
      AF.focusMode?.destroy?.();

      this.messageListener = null;

      console.info("[Ambient Flow] Controller destroyed.");
    }
  }

  AF.AmbientFlowController = AmbientFlowController;

  AF.controller = AF.controller || new AmbientFlowController();

  AF.destroy = () => {
    AF.controller?.destroy?.();
  };

  // Start once the document is ready.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => AF.controller.init(), {
      once: true,
    });
  } else {
    AF.controller.init();
  }
})();
