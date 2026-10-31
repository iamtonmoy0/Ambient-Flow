/**
 * YouTube Ambient Flow
 * Color Extractor Tests
 *
 * Run:
 * npm test
 *
 * Requires Jest and jsdom.
 */

const { ColorExtractor } = require("../src/content/color-extractor.js");

describe("ColorExtractor", () => {
  let extractor;
  let video;
  let canvas;
  let context;

  beforeEach(() => {
    document.body.innerHTML = `
      <video id="test-video"></video>
      <canvas id="test-canvas"></canvas>
    `;

    video = document.getElementById("test-video");
    canvas = document.getElementById("test-canvas");

    Object.defineProperty(video, "videoWidth", {
      configurable: true,
      value: 640,
    });

    Object.defineProperty(video, "videoHeight", {
      configurable: true,
      value: 360,
    });

    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 4,
    });

    context = {
      drawImage: jest.fn(),

      getImageData: jest.fn(() => ({
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
        ]),
      })),

      clearRect: jest.fn(),
    };

    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => context);

    extractor = new ColorExtractor();
  });

  afterEach(() => {
    extractor?.destroy();

    jest.restoreAllMocks();
  });

  describe("Initialization", () => {
    test("should create a ColorExtractor instance", () => {
      expect(extractor).toBeDefined();
    });

    test("should initialize with a default scene threshold", () => {
      expect(extractor.sceneThreshold).toBeDefined();
    });
  });

  describe("Color conversion", () => {
    test("should convert RGB to HEX", () => {
      const result = extractor.rgbToHex({
        r: 255,
        g: 0,
        b: 0,
      });

      expect(result.toLowerCase()).toBe("#ff0000");
    });

    test("should convert black RGB to HEX", () => {
      const result = extractor.rgbToHex({
        r: 0,
        g: 0,
        b: 0,
      });

      expect(result.toLowerCase()).toBe("#000000");
    });

    test("should convert white RGB to HEX", () => {
      const result = extractor.rgbToHex({
        r: 255,
        g: 255,
        b: 255,
      });

      expect(result.toLowerCase()).toBe("#ffffff");
    });

    test("should reject invalid RGB input safely", () => {
      expect(() => {
        extractor.rgbToHex(null);
      }).not.toThrow();
    });
  });

  describe("Video validation", () => {
    test("should reject a missing video element", () => {
      const result = extractor.analyze(null);

      expect(result).toBeFalsy();
    });

    test("should reject a video with zero dimensions", () => {
      Object.defineProperty(video, "videoWidth", {
        configurable: true,
        value: 0,
      });

      const result = extractor.analyze(video);

      expect(result).toBeFalsy();
    });

    test("should reject a video that is not ready", () => {
      Object.defineProperty(video, "readyState", {
        configurable: true,
        value: 0,
      });

      const result = extractor.analyze(video);

      expect(result).toBeFalsy();
    });
  });

  describe("Canvas processing", () => {
    test("should draw a valid video frame", () => {
      extractor.analyze(video);

      expect(context.drawImage).toHaveBeenCalled();
    });

    test("should read frame pixel data", () => {
      extractor.analyze(video);

      expect(context.getImageData).toHaveBeenCalled();
    });

    test("should handle canvas security restrictions", () => {
      context.getImageData.mockImplementation(() => {
        const error = new Error(
          "The canvas has been tainted by cross-origin data.",
        );

        error.name = "SecurityError";

        throw error;
      });

      expect(() => {
        extractor.analyze(video);
      }).not.toThrow();
    });

    test("should handle drawImage errors", () => {
      context.drawImage.mockImplementation(() => {
        throw new Error("Unable to draw video frame");
      });

      expect(() => {
        extractor.analyze(video);
      }).not.toThrow();
    });
  });

  describe("Scene configuration", () => {
    test("should update scene threshold", () => {
      const result = extractor.setSceneThreshold(25);

      expect(result).not.toBe(false);

      expect(extractor.sceneThreshold).toBe(25);
    });

    test("should reject invalid scene threshold", () => {
      const result = extractor.setSceneThreshold(-10);

      expect(result).toBe(false);
    });

    test("should reject non-numeric threshold", () => {
      const result = extractor.setSceneThreshold("invalid");

      expect(result).toBe(false);
    });
  });

  describe("Reset and cleanup", () => {
    test("should reset extractor state", () => {
      expect(() => {
        extractor.reset();
      }).not.toThrow();
    });

    test("should destroy extractor safely", () => {
      expect(() => {
        extractor.destroy();
      }).not.toThrow();
    });

    test("should safely handle repeated destroy calls", () => {
      expect(() => {
        extractor.destroy();
        extractor.destroy();
      }).not.toThrow();
    });
  });
});
