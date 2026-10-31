(() => {
  "use strict";

  const AF = window.AmbientFlow;

  const storage = {
    // Get all settings
    async getAll() {
      const stored = await chrome.storage.local.get(null);

      return {
        ...AF.DEFAULTS,
        ...stored,
      };
    },

    // Get a specific setting
    async get(key) {
      const result = await chrome.storage.local.get(key);

      return result[key] !== undefined ? result[key] : AF.DEFAULTS[key];
    },

    // Save settings
    async set(values) {
      await chrome.storage.local.set(values);

      window.dispatchEvent(
        new CustomEvent(AF.EVENTS.SETTINGS_CHANGED, {
          detail: values,
        }),
      );

      return true;
    },

    // Reset all settings
    async reset() {
      await chrome.storage.local.clear();

      await chrome.storage.local.set(AF.DEFAULTS);

      window.dispatchEvent(
        new CustomEvent(AF.EVENTS.SETTINGS_CHANGED, {
          detail: AF.DEFAULTS,
        }),
      );

      return AF.DEFAULTS;
    },

    // Save the current channel theme
    async saveChannelColor(color) {
      const settings = await this.getAll();

      if (!settings.rememberChannelThemes) {
        return false;
      }

      const channel = AF.utils.getChannelKey();

      const profiles = {
        ...settings.channelProfiles,
        [channel]: color,
      };

      await this.set({
        channelProfiles: profiles,
      });

      return true;
    },

    // Get saved channel theme
    async getChannelColor() {
      const settings = await this.getAll();

      if (!settings.rememberChannelThemes) {
        return null;
      }

      const channel = AF.utils.getChannelKey();

      return settings.channelProfiles[channel] || null;
    },

    // Remove a saved channel theme
    async removeChannelColor(channel) {
      const settings = await this.getAll();

      const profiles = {
        ...settings.channelProfiles,
      };

      delete profiles[channel];

      await this.set({
        channelProfiles: profiles,
      });
    },

    // Save the last detected color
    async saveLastColor(color) {
      await chrome.storage.local.set({
        lastColor: color,
      });
    },

    // Get last detected color
    async getLastColor() {
      return this.get("lastColor");
    },

    // Export user settings
    async exportSettings() {
      const settings = await this.getAll();

      return JSON.stringify(settings, null, 2);
    },

    // Import user settings
    async importSettings(json) {
      let imported;

      try {
        imported = JSON.parse(json);
      } catch {
        throw new Error("Invalid settings JSON.");
      }

      if (
        !imported ||
        typeof imported !== "object" ||
        Array.isArray(imported)
      ) {
        throw new Error("Invalid settings format.");
      }

      const validKeys = Object.keys(AF.DEFAULTS);

      const cleanSettings = {};

      for (const key of validKeys) {
        if (Object.prototype.hasOwnProperty.call(imported, key)) {
          cleanSettings[key] = imported[key];
        }
      }

      await this.set(cleanSettings);

      return true;
    },
  };

  AF.storage = storage;

  // Listen for changes from other extension contexts
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    const updated = {};

    for (const [key, change] of Object.entries(changes)) {
      updated[key] = change.newValue;
    }

    window.dispatchEvent(
      new CustomEvent(AF.EVENTS.SETTINGS_CHANGED, {
        detail: updated,
      }),
    );
  });
})();
