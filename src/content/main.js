/**
 * YouTube Ambient Flow
 * Main Content Controller
 *
 * Coordinates the extension's content-side modules,
 * settings, focus mode, and runtime messages.
 */

(() => {
  "use strict";

  const AF = (window.AmbientFlow = window.AmbientFlow || {});

  const MESSAGE_TYPES = {
    GET_STATUS: "GET_STATUS",
    GET_SETTINGS: "GET_SETTINGS",
    UPDATE_SETTINGS: "UPDATE_SETTINGS",
    TOGGLE_AMBIENT_FLOW: "TOGGLE_AMBIENT_FLOW",
    TOGGLE_FOCUS_MODE: "TOGGLE_FOCUS_MODE",
    UPDATE_FOCUS_SETTINGS: "UPDATE_FOCUS_SETTINGS",
    FREEZE_BACKGROUND: "FREEZE_BACKGROUND",
    SET_CUSTOM_COLOR: "SET_CUSTOM_COLOR",
    RESET_THEME: "RESET_THEME",
  };

  const DEFAULT_FOCUS_SETTINGS = {
    hideSidebar: false,
    hideComments: false,
    hideRecommendations: false,
    hideChat: false,
    hideHeader: false,
    hideShortsControls: false,
  };

  class AmbientFlowController {
    constructor() {
      this.analyzer = AF.videoAnalyzer || null;
      this.focusMode = AF.focusMode || null;
      this.storage = AF.storage || null;

      this.initialized = false;
      this.destroyed = false;

      this.settings = {};
      this.focusSettings = {
        ...DEFAULT_FOCUS_SETTINGS,
      };

      this.boundMessageHandler = this.handleRuntimeMessage.bind(this);

      this.boundKeyHandler = this.handleKeyboardShortcut.bind(this);

      this.boundPageHideHandler = this.handlePageHide.bind(this);

      this.unsubscribers = [];
    }

    async init() {
      if (this.initialized || this.destroyed) return;

      this.initialized = true;

      this.registerMessageListener();
      this.registerKeyboardShortcuts();
      this.registerPageLifecycle();

      await this.loadSettings();

      if (this.focusSettings.enabled) {
        this.focusMode?.enable?.(this.focusSettings);
      }

      await this.analyzer?.start?.();

      this.emitReady();

      console.info("[AmbientFlow] Initialized.");
    }

    registerMessageListener() {
      if (!chrome?.runtime?.onMessage) return;

      chrome.runtime.onMessage.addListener(this.boundMessageHandler);
    }

    registerKeyboardShortcuts() {
      document.addEventListener("keydown", this.boundKeyHandler);
    }

    registerPageLifecycle() {
      window.addEventListener("pagehide", this.boundPageHideHandler);
    }

    emitReady() {
      this.sendRuntimeMessage({
        type: "AMBIENT_FLOW_READY",
      });
    }

    async loadSettings() {
      try {
        let stored = {};

        if (this.storage?.getAll) {
          stored = await this.storage.getAll();
        } else if (this.storage?.get) {
          stored = await this.storage.get();
        }

        this.settings = {
          ...(stored || {}),
        };

        this.focusSettings = {
          ...DEFAULT_FOCUS_SETTINGS,
          ...this.settings,
          enabled: Boolean(this.settings.focusModeEnabled),
        };

        this.focusMode?.updateSettings?.(this.focusSettings);

        return this.settings;
      } catch (error) {
        console.error("[AmbientFlow] Settings load failed:", error);

        this.settings = {};
        this.focusSettings = {
          ...DEFAULT_FOCUS_SETTINGS,
          enabled: false,
        };

        return this.settings;
      }
    }

    async saveSettings(updates) {
      if (!this.storage?.set) {
        throw new Error("Storage manager is unavailable.");
      }

      await this.storage.set(updates);

      this.settings = {
        ...this.settings,
        ...updates,
      };

      return this.settings;
    }

    validateSettingsUpdate(updates) {
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        return {
          valid: false,
          errors: ["Settings must be an object."],
        };
      }

      if (!AF.settings?.validate) {
        return {
          valid: true,
          settings: {
            ...this.settings,
            ...updates,
          },
        };
      }

      // Validate the merged settings, not just the partial update.
      const merged = {
        ...this.settings,
        ...updates,
      };

      const result = AF.settings.validate(merged);

      if (!result?.valid) {
        return {
          valid: false,
          errors: result?.errors || ["Invalid settings."],
        };
      }

      return {
        valid: true,
        settings: result.settings || merged,
      };
    }

    async updateSettings(updates = {}) {
      const validation = this.validateSettingsUpdate(updates);

      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }

      try {
        const validated = validation.settings;

        await this.saveSettings(validated);

        await this.analyzer?.handleSettingsChange?.(validated);

        this.focusSettings = {
          ...this.focusSettings,
          ...validated,
          enabled: Boolean(validated.focusModeEnabled),
        };

        if (validated.focusModeEnabled) {
          this.focusMode?.enable?.(this.focusSettings);
        } else {
          this.focusMode?.disable?.();
        }

        return {
          success: true,
          settings: this.settings,
        };
      } catch (error) {
        console.error("[AmbientFlow] Settings update failed:", error);

        return {
          success: false,
          error: error.message,
        };
      }
    }

    async toggleAmbientFlow(enabled) {
      const nextEnabled =
        typeof enabled === "boolean"
          ? enabled
          : !Boolean(this.settings.enabled);

      try {
        await this.saveSettings({
          enabled: nextEnabled,
        });

        this.analyzer?.setEnabled?.(nextEnabled);

        return {
          success: true,
          enabled: nextEnabled,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    async toggleFocusMode(enabled) {
      const nextEnabled =
        typeof enabled === "boolean" ? enabled : !this.focusSettings.enabled;

      this.focusSettings = {
        ...this.focusSettings,
        enabled: nextEnabled,
      };

      try {
        await this.saveSettings({
          focusModeEnabled: nextEnabled,
        });

        if (nextEnabled) {
          this.focusMode?.enable?.(this.focusSettings);
        } else {
          this.focusMode?.disable?.();
        }

        return {
          success: true,
          enabled: nextEnabled,
          settings: this.focusSettings,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    async updateFocusSettings(updates = {}) {
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        return {
          success: false,
          error: "Invalid focus settings.",
        };
      }

      const allowedKeys = Object.keys(DEFAULT_FOCUS_SETTINGS);

      const safeUpdates = {};

      for (const key of allowedKeys) {
        if (typeof updates[key] === "boolean") {
          safeUpdates[key] = updates[key];
        }
      }

      this.focusSettings = {
        ...this.focusSettings,
        ...safeUpdates,
      };

      try {
        await this.saveSettings(safeUpdates);

        this.focusMode?.updateSettings?.(this.focusSettings);

        if (this.focusSettings.enabled) {
          this.focusMode?.enable?.(this.focusSettings);
        }

        return {
          success: true,
          settings: this.focusSettings,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    async freezeBackground(color) {
      const selectedColor =
        color ||
        this.analyzer?.getStatus?.()?.stats?.lastColor ||
        this.settings.frozenColor ||
        "#202020";

      try {
        await this.saveSettings({
          frozen: true,
          freezeBackground: true,
          frozenColor: selectedColor,
        });

        await this.analyzer?.handleSettingsChange?.({
          frozen: true,
          freezeBackground: true,
          frozenColor: selectedColor,
        });

        this.analyzer?.freeze?.(selectedColor);

        return {
          success: true,
          frozen: true,
          color: selectedColor,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    async setCustomColor(color) {
      if (
        typeof color !== "string" ||
        !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
      ) {
        return {
          success: false,
          error: "Invalid hex color.",
        };
      }

      return this.freezeBackground(color);
    }

    async resetTheme() {
      try {
        await this.saveSettings({
          frozen: false,
          freezeBackground: false,
          frozenColor: "#202020",
        });

        this.analyzer?.unfreeze?.();

        await this.analyzer?.handleSettingsChange?.({
          frozen: false,
          freezeBackground: false,
          frozenColor: "#202020",
        });

        this.analyzer?.themeEngine?.reset?.();
        this.analyzer?.ambientGlow?.reset?.();

        if (
          this.analyzer?.video &&
          !this.analyzer.video.paused &&
          !this.analyzer.video.ended
        ) {
          this.analyzer.syncPlaybackState?.();
        }

        return {
          success: true,
          reset: true,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    getStatus() {
      const analyzer = this.analyzer?.getStatus?.() || {};
      const stats = analyzer.stats || {};
      const video = this.analyzer?.video || null;

      const hasVideo = Boolean(
        video && video.isConnected && analyzer.videoConnected,
      );

      const isPlaying = Boolean(
        hasVideo && !analyzer.paused && !analyzer.ended,
      );

      return {
        success: true,

        // Popup-compatible status
        available: true,
        initialized: this.initialized,
        enabled: analyzer.enabled ?? this.settings.enabled ?? true,

        hasVideo,
        isPlaying,
        isPaused: hasVideo && Boolean(analyzer.paused),
        isEnded: Boolean(analyzer.ended),
        isBlocked: Boolean(analyzer.canvasBlocked),

        analysisActive: Boolean(analyzer.running),

        videoTitle: hasVideo ? document.title : "No active video",

        currentColor: stats.lastColor || null,

        performance: {
          currentInterval: analyzer.samplingInterval || 700,
          sceneChanges: stats.sceneChanges || 0,
          samples: stats.samples || 0,
          successfulSamples: stats.successfulSamples || 0,
        },

        // Preserve detailed diagnostic information
        analyzer,
        focusMode: this.focusMode?.getStatus?.() || null,
        theme: this.analyzer?.themeEngine?.getStatus?.() || null,

        settings: this.settings,
        focusSettings: this.focusSettings,
      };
    }

    handleRuntimeMessage(message, sender, sendResponse) {
      if (!message || typeof message.type !== "string") {
        return false;
      }

      const respond = async () => {
        switch (message.type) {
          case MESSAGE_TYPES.GET_STATUS:
            return {
              success: true,
              status: this.getStatus(),
            };

          case MESSAGE_TYPES.GET_SETTINGS:
            return {
              success: true,
              settings: this.settings,
            };

          case MESSAGE_TYPES.UPDATE_SETTINGS:
            return this.updateSettings(message.settings || {});

          case MESSAGE_TYPES.TOGGLE_AMBIENT_FLOW:
            return this.toggleAmbientFlow(message.enabled);

          case MESSAGE_TYPES.TOGGLE_FOCUS_MODE:
            return this.toggleFocusMode(message.enabled);

          case MESSAGE_TYPES.UPDATE_FOCUS_SETTINGS:
            return this.updateFocusSettings(message.settings || {});

          case MESSAGE_TYPES.FREEZE_BACKGROUND:
            return this.freezeBackground(message.color);

          case MESSAGE_TYPES.SET_CUSTOM_COLOR:
            return this.setCustomColor(message.color);

          case MESSAGE_TYPES.RESET_THEME:
            return this.resetTheme();

          default:
            return {
              success: false,
              error: "Unknown message type.",
            };
        }
      };

      respond()
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error.message,
          });
        });

      // Keep the message channel open for async responses.
      return true;
    }

    handleKeyboardShortcut(event) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (!event.altKey || !event.shiftKey) return;

      const key = event.key.toLowerCase();

      switch (key) {
        case "a":
          event.preventDefault();
          this.toggleAmbientFlow();
          break;

        case "f":
          event.preventDefault();
          this.toggleFocusMode();
          break;

        case "c":
          event.preventDefault();
          this.freezeBackground();
          break;

        default:
          break;
      }
    }

    sendRuntimeMessage(message) {
      if (!chrome?.runtime?.sendMessage) return;

      try {
        chrome.runtime.sendMessage(message, () => {
          // Access lastError to avoid unchecked runtime errors.
          void chrome.runtime.lastError;
        });
      } catch (error) {
        console.warn("[AmbientFlow] Runtime message failed:", error);
      }
    }

    handlePageHide() {
      this.analyzer?.stop?.();
    }

    destroy() {
      if (this.destroyed) return;

      chrome?.runtime?.onMessage?.removeListener(this.boundMessageHandler);

      document.removeEventListener("keydown", this.boundKeyHandler);

      window.removeEventListener("pagehide", this.boundPageHideHandler);

      this.unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // Ignore cleanup errors.
        }
      });

      this.unsubscribers = [];

      this.analyzer?.destroy?.();
      this.focusMode?.destroy?.();

      this.initialized = false;
      this.destroyed = true;
    }
  }

  AF.AmbientFlowController = AmbientFlowController;

  if (!AF.controller) {
    AF.controller = new AmbientFlowController();

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => AF.controller.init(),
        { once: true },
      );
    } else {
      AF.controller.init();
    }
  }
})();
