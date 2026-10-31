# YouTube Ambient Flow

**Turn YouTube into an immersive, cinematic viewing experience.**

YouTube Ambient Flow is a Chrome extension that dynamically adapts YouTube's interface colors to the visuals of the currently playing video.

It analyzes video frames locally, extracts representative colors, and applies a coordinated ambient theme across the YouTube page — including backgrounds, recommendations, comments, and surrounding interface elements.

No external AI API. No cloud processing. No subscription.

---

## Features

### Dynamic Ambient Themes

- Extract dominant and average colors from video frames.
- Generate coordinated color palettes.
- Dynamically theme YouTube backgrounds and interface surfaces.
- Smooth transitions between different scenes.
- Support gradient, solid, and transparent background styles.

### Cinematic Viewing

- Ambient glow around the video player.
- Adjustable glow intensity and blur.
- Cinematic, Minimal, Vibrant, and Relax modes.
- Focus Mode to reduce distractions.
- Full-screen-friendly visual styling.

### Intelligent Color Analysis

- Periodic video frame sampling.
- Scene-change detection.
- Color smoothing to reduce flickering.
- Custom color selection.
- Freeze the current background.
- Remember themes for individual channels.

### Readability

- Contrast-aware text colors.
- Readability optimization.
- Preserves important YouTube controls.
- Reduced-motion support.

### YouTube Compatibility

- Watch pages.
- YouTube Shorts.
- Dynamic navigation support.
- Responsive interface styling.

### Performance

- High Performance mode.
- Balanced mode.
- Battery Saver mode.
- Adaptive sampling infrastructure.
- Lightweight local processing.

### Privacy

- Video analysis happens locally in the browser.
- No external AI services.
- No account registration.
- No video uploads.
- No analytics server required.

---

## Installation

### Option 1: Install locally using Chrome

1. Clone or download this repository.
2. Extract the project folder.
3. Open Chrome.
4. Navigate to `chrome://extensions/`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the `youtube-ambient-flow` folder.
8. Open YouTube and play a video.

### Option 2: Install from Chrome Web Store

A Chrome Web Store release can be added here after publication.

---

## Keyboard Shortcuts

| Shortcut          | Action                        |
| ----------------- | ----------------------------- |
| `Alt + Shift + A` | Toggle Ambient Flow           |
| `Alt + Shift + F` | Toggle Focus Mode             |
| `Alt + Shift + C` | Freeze or unfreeze background |

Shortcuts can be customized through Chrome's extension shortcut settings.

---

## Viewing Modes

| Mode      | Description                                |
| --------- | ------------------------------------------ |
| Cinematic | Rich ambient colors and smooth transitions |
| Minimal   | Subtle colors and reduced visual effects   |
| Vibrant   | Stronger saturation and ambient intensity  |
| Relax     | Softer colors and slower transitions       |

---

## Performance Profiles

| Profile       | Intended use                               |
| ------------- | ------------------------------------------ |
| High          | More frequent visual sampling              |
| Balanced      | General everyday usage                     |
| Battery Saver | Less frequent sampling and reduced effects |

---

## Project Structure

```text
youtube-ambient-flow/
├── manifest.json
├── README.md
├── LICENSE
├── PRIVACY.md
├── assets/
│   ├── icons/
│   └── images/
├── src/
│   ├── background/
│   ├── content/
│   ├── popup/
│   ├── options/
│   ├── styles/
│   ├── shared/
│   └── engines/
├── tests/
└── docs/
```

### Architecture

The extension uses a modular architecture:

- **Video Detector:** Detects the active YouTube video.
- **Frame Sampler:** Captures frames for local analysis.
- **Scene Detector:** Identifies meaningful visual changes.
- **Color Extractor:** Extracts representative colors.
- **Color Engine:** Processes and adjusts color values.
- **Palette Engine:** Generates coordinated palettes.
- **Theme Engine:** Applies the generated theme.
- **Readability Engine:** Helps preserve text contrast.
- **Ambient Glow:** Creates the surrounding lighting effect.
- **Performance Engine:** Controls sampling behavior.

---

## Technical Stack

- JavaScript
- Chrome Extension Manifest V3
- HTML5
- CSS3
- Chrome Storage API
- Canvas API
- MutationObserver
- YouTube DOM integration

No backend server is required for the core functionality.

---

## Important Technical Limitation

YouTube may deliver video frames through cross-origin protected media streams.

Depending on browser behavior and video delivery, canvas pixel extraction may fail with a security error.

When this happens, the extension should gracefully stop frame-based analysis, retain the last usable theme, and report the limitation rather than claiming that analysis is working.

This is a browser security restriction, not necessarily an extension bug.

---

## Development

The extension uses classic JavaScript scripts and a shared global namespace:

```js
window.AmbientFlow;
```

Content scripts are loaded in dependency order through `manifest.json`.

After modifying files:

1. Open `chrome://extensions/`.
2. Find YouTube Ambient Flow.
3. Click Reload.
4. Refresh the YouTube tab.

See the `docs/` directory for architecture, features, and development documentation.

---

## Privacy

YouTube Ambient Flow is designed to process video colors locally.

It does not need:

- Your Google password.
- YouTube account credentials.
- External AI APIs.
- Video uploads.
- A remote processing server.

Read [PRIVACY.md](PRIVACY.md) for more information.

---

## Roadmap

- [x] Manifest V3 foundation
- [x] Modular color-processing architecture
- [x] Video frame sampling
- [x] Scene detection
- [x] Dynamic palette generation
- [x] Theme engine
- [x] Ambient glow
- [x] Focus Mode
- [x] Shorts support
- [x] Popup interface
- [x] Advanced settings interface
- [ ] End-to-end integration testing
- [ ] Cross-browser testing
- [ ] Performance benchmarking
- [ ] Chrome Web Store release

---

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the extension locally.
5. Submit a pull request.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

**YouTube Ambient Flow — Let every video paint your screen.**
