/**
 * YouTube Ambient Flow
 * Theme Engine Tests
 *
 * Run:
 * npm test
 *
 * Requires Jest and jsdom.
 */

const { ThemeEngine } = require("../src/content/theme-engine.js");

describe("ThemeEngine", () => {
  let engine;

  const testColor = {
    r: 120,
    g: 80,
    b: 180,
  };

  beforeEach(() => {
    document.documentElement.innerHTML = "";

    window.AmbientFlow = window.AmbientFlow || {};

    window.AmbientFlow.paletteEngine = {
      createPalette: jest.fn(() => ({
        primary: "#7850b4",
        secondary: "#604090",
        tertiary: "#9060c0",
        background: "#181020",
        surface: "#282030",
        text: "#ffffff",
        muted: "#aaaaaa",
        border: "#444444",
        glow: "#7850b4",
        accent: "#9060c0",
      })),

      reset: jest.fn(),
    };

    window.AmbientFlow.gradientEngine = {
      create: jest.fn(() => "radial-gradient(circle, #7850b4, #181020)"),

      reset: jest.fn(),

      setIntensity: jest.fn(),
    };

    window.AmbientFlow.colorEngine = {
      normalize: jest.fn((color) => {
        if (typeof color === "string") {
          return {
            r: 120,
            g: 80,
            b: 180,
          };
        }

        return color;
      }),

      bestTextColor: jest.fn(() => "#ffffff"),
    };

    engine = new ThemeEngine();
  });

  afterEach(() => {
    engine?.destroy();

    delete window.AmbientFlow;
  });

  describe("Initialization", () => {
    test("should create a ThemeEngine instance", () => {
      expect(engine).toBeDefined();
    });

    test("should initialize as enabled by default", () => {
      expect(engine.getStatus().enabled).toBe(true);
    });

    test("should capture original document styles", () => {
      expect(engine.originalVariables).toBeDefined();
    });
  });

  describe("Color application", () => {
    test("should apply a valid RGB color", () => {
      const result = engine.applyColor(testColor);

      expect(result).toBeTruthy();

      expect(document.documentElement.getAttribute("data-af-enabled")).toBe(
        "true",
      );
    });

    test("should generate a palette", () => {
      engine.applyColor(testColor);

      expect(window.AmbientFlow.paletteEngine.createPalette).toHaveBeenCalled();
    });

    test("should generate a background gradient", () => {
      engine.applyColor(testColor);

      expect(window.AmbientFlow.gradientEngine.create).toHaveBeenCalled();
    });

    test("should apply CSS variables", () => {
      engine.applyColor(testColor);

      const root = document.documentElement;

      expect(root.style.getPropertyValue("--af-primary")).not.toBe("");

      expect(root.style.getPropertyValue("--af-background")).not.toBe("");
    });

    test("should handle invalid colors without throwing", () => {
      expect(() => {
        engine.applyColor(null);
      }).not.toThrow();
    });
  });

  describe("Theme controls", () => {
    test("should disable the theme", () => {
      engine.setEnabled(false);

      expect(engine.getStatus().enabled).toBe(false);
    });

    test("should enable the theme", () => {
      engine.setEnabled(false);

      engine.setEnabled(true);

      expect(engine.getStatus().enabled).toBe(true);
    });

    test("should freeze the current color", () => {
      const result = engine.freeze(testColor);

      expect(result).toBeTruthy();

      expect(engine.getStatus().frozen).toBe(true);
    });

    test("should unfreeze the theme", () => {
      engine.freeze(testColor);

      engine.unfreeze();

      expect(engine.getStatus().frozen).toBe(false);
    });
  });

  describe("Reset behavior", () => {
    test("should reset the theme", () => {
      engine.applyColor(testColor);

      engine.reset();

      expect(engine.getStatus().frozen).toBe(false);
    });

    test("should reset the palette engine", () => {
      engine.applyColor(testColor);

      engine.reset();

      expect(window.AmbientFlow.paletteEngine.reset).toHaveBeenCalled();
    });

    test("should reset the gradient engine", () => {
      engine.applyColor(testColor);

      engine.reset();

      expect(window.AmbientFlow.gradientEngine.reset).toHaveBeenCalled();
    });
  });

  describe("Settings", () => {
    test("should accept valid settings", () => {
      expect(() => {
        engine.setSettings({
          transitionDuration: 500,
          glowIntensity: 70,
        });
      }).not.toThrow();
    });

    test("should expose theme status", () => {
      const status = engine.getStatus();

      expect(status).toHaveProperty("enabled");
      expect(status).toHaveProperty("frozen");
    });
  });

  describe("Cleanup", () => {
    test("should destroy the theme engine", () => {
      engine.destroy();

      expect(engine.isDestroyed).toBe(true);
    });

    test("should safely handle repeated destroy calls", () => {
      expect(() => {
        engine.destroy();
        engine.destroy();
      }).not.toThrow();
    });
  });
});
