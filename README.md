# Kick VOD Resume

A Chrome extension (Manifest V3) that tracks playback progress on Kick.com video-on-demand (VOD) streams, allowing users to resume playback from where they left off.

---

## Features

- **Resume Prompt**: Displays an on-screen prompt to resume playback when returning to a previously watched VOD.
- **Accurate Player Detection**: Targets the active stream player while ignoring sidebar previews and looped media elements.
- **Quick Save Shortcut**: Save playback position using the extension popup or the default shortcut (`Alt + Shift + S`).
- **VOD Management**: View saved records with streamer name, title, progress percentage, and timestamp.
- **Search and Filter**: Filter saved streams by streamer name or title.
- **Timestamp Parameter Support**: Supports `?t=seconds` query parameters for deep linking and time restoration.
- **Local Storage**: All data is stored locally via `chrome.storage.local`. No external servers, analytics, or third-party tracking are used.

---

## Project Structure

```text
kick-vod/
├── background/
│   └── background.js     # Service worker handling commands and badge updates
├── content/
│   ├── content.css       # In-page resume prompt styling
│   └── content.js        # DOM observer and playback controller
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.css         # Popup user interface styling
│   ├── popup.html        # Popup markup
│   └── popup.js          # Popup state and storage interaction
├── .gitignore
├── LICENSE
├── manifest.json         # Extension manifest (Manifest V3)
└── README.md
```

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/dilbertan/kick-vod-resume.git
   ```

2. Open the extensions management page in a Chromium-based browser:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`

3. Enable **Developer mode** via the toggle in the upper right corner.

4. Click **Load unpacked** and select the root project directory.

5. Navigate to any VOD on Kick.com to begin tracking playback.

---

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Save Playback Position | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | <kbd>Option</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> |

Shortcuts can be modified at `chrome://extensions/shortcuts`.

---

## Permissions and Privacy

- **chrome.storage**: Used to store timestamps and stream metadata locally on the device.
- **activeTab**: Used to access the current Kick tab when triggering shortcuts or popup actions.
- **No external requests**: The extension does not collect, transmit, or process data outside the user's browser.

---

## License

This project is licensed under the [MIT License](LICENSE).
