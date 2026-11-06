/**
 * YouTube Ambient Flow - Popup UI Controller
 */

const els = {
  enabled: document.getElementById("enabled"),
  focusBtn: document.getElementById("focusBtn"),
  freezeBtn: document.getElementById("freezeBtn"),
  mode: document.getElementById("mode"),
  performance: document.getElementById("performance"),
  backgroundStyle: document.getElementById("backgroundStyle"),
  glowIntensity: document.getElementById("glowIntensity"),
  glowBlur: document.getElementById("glowBlur"),
  resetBtn: document.getElementById("resetBtn"),
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(action, patch) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { action, patch });
  } catch {
    return null;
  }
}

function syncUI(state) {
  if (!state) return;
  els.enabled.checked = !!state.enabled;
  els.focusBtn.classList.toggle("active", !!state.focusMode);
  els.freezeBtn.classList.toggle("active", !!state.frozen);
  els.mode.value = state.mode || "cinematic";
  els.performance.value = state.performance || "balanced";
  els.backgroundStyle.value = state.backgroundStyle || "gradient";
  els.glowIntensity.value = state.glowIntensity ?? 0.6;
  els.glowBlur.value = state.glowBlur ?? 80;
}

async function init() {
  const res = await sendToTab("getState");
  if (res && res.state) {
    syncUI(res.state);
  } else {
    const { ambientFlowState } =
      await chrome.storage.local.get("ambientFlowState");
    if (ambientFlowState) syncUI(ambientFlowState);
  }
}

els.enabled.addEventListener("change", () => {
  sendToTab("setState", { enabled: els.enabled.checked });
});

els.focusBtn.addEventListener("click", async () => {
  const res = await sendToTab("toggleFocus");
  if (res && res.state) syncUI(res.state);
});

els.freezeBtn.addEventListener("click", async () => {
  const res = await sendToTab("toggleFreeze");
  if (res && res.state) syncUI(res.state);
});

els.mode.addEventListener("change", () => {
  sendToTab("setState", { mode: els.mode.value });
});

els.performance.addEventListener("change", () => {
  sendToTab("setState", { performance: els.performance.value });
});

els.backgroundStyle.addEventListener("change", () => {
  sendToTab("setState", { backgroundStyle: els.backgroundStyle.value });
});

els.glowIntensity.addEventListener("input", () => {
  sendToTab("setState", { glowIntensity: parseFloat(els.glowIntensity.value) });
});

els.glowBlur.addEventListener("input", () => {
  sendToTab("setState", { glowBlur: parseInt(els.glowBlur.value, 10) });
});

els.resetBtn.addEventListener("click", async () => {
  const res = await sendToTab("reset");
  if (res && res.state) syncUI(res.state);
});

init();
