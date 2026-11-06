/**
 * YouTube Ambient Flow - Background Service Worker
 * Handles keyboard command routing and lifecycle.
 */

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  const actionMap = {
    "toggle-ambient-flow": "toggle",
    "toggle-focus-mode": "toggleFocus",
    "freeze-background": "toggleFreeze",
  };

  const action = actionMap[command];
  if (!action) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch (err) {
    console.debug("[AmbientFlow] Could not deliver command:", err.message);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[AmbientFlow] Extension installed");
});
