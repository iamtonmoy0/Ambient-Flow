(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    autoStart: true,

    // Visual modes
    mode: "cinematic",
    colorSource: "dominant",
    backgroundStyle: "gradient",

    // Visual settings
    intensity: 68,
    saturation: 72,
    blur: 54,
    transitionMs: 900,

    // Performance
    sampleInterval: 1000,
    performanceMode: "balanced",

    // Features
    sceneDetection: true,
    ambientGlow: true,
    readability: true,
    focusMode: false,
    shortsSupport: true,
    rememberChannelThemes: true,

    // Accessibility
    reducedMotion: false,

    // Background controls
    frozen: false,
    frozenColor: "#243b55",
    customColor: "#243b55",
    lastColor: "#243b55",

    // Channel-specific themes
    channelProfiles: {},
  };

  const MODES = {
    cinematic: {
      saturation: 78,
      intensity: 72,
      blur: 62,
      transitionMs: 1000,
    },

    minimal: {
      saturation: 34,
      intensity: 38,
      blur: 28,
      transitionMs: 700,
    },

    vibrant: {
      saturation: 100,
      intensity: 88,
      blur: 75,
      transitionMs: 600,
    },

    relax: {
      saturation: 42,
      intensity: 46,
      blur: 48,
      transitionMs: 1500,
    },
  };

  const PERFORMANCE = {
    high: {
      sampleInterval: 500,
      sampleWidth: 64,
      sampleHeight: 36,
    },

    balanced: {
      sampleInterval: 1000,
      sampleWidth: 48,
      sampleHeight: 27,
    },

    battery: {
      sampleInterval: 2500,
      sampleWidth: 32,
      sampleHeight: 18,
    },
  };

  const SELECTORS = {
    video: "video.html5-main-video",
    player: "#movie_player",
    app: "ytd-app",
    watch: "ytd-watch-flexy",
    secondary: "#secondary",
    comments: "ytd-comments",
    masthead: "ytd-masthead",
    recommendations: "ytd-watch-next-secondary-results-renderer",
  };

  const EVENTS = {
    SETTINGS_CHANGED: "ambientflow:settings",
    COLOR_CHANGED: "ambientflow:color",
    VIDEO_CHANGED: "ambientflow:video",
    ANALYSIS_ERROR: "ambientflow:analysis-error",
  };

  const CSS_VARIABLES = {
    PRIMARY: "--af-primary",
    SECONDARY: "--af-secondary",
    TERTIARY: "--af-tertiary",
    BACKGROUND: "--af-background",
    TEXT: "--af-text",
    SURFACE: "--af-surface",
    GLOW: "--af-glow",
    INTENSITY: "--af-intensity",
    BLUR: "--af-blur",
    TRANSITION: "--af-transition",
  };

  window.AmbientFlow = window.AmbientFlow || {};

  Object.assign(window.AmbientFlow, {
    DEFAULTS,
    MODES,
    PERFORMANCE,
    SELECTORS,
    EVENTS,
    CSS_VARIABLES,
  });
})();
