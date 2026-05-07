# LocalPrep

> Local audio preparation tool — built with Electron, powered by ffmpeg.

Desktop tool for preparing local audio files. Convert sample rates & formats, edit metadata and cover art, reorder tracklists across multiple discs — all with a built-in audio preview player. Built for anyone who wants their local music library perfectly tagged and streaming-ready. No cloud, no subscriptions, no telemetry.

---

## Features

| Tab | What it does |
|-----|--------------|
| **Sample Rate** | Batch-convert audio files to any target sample rate (44.1 kHz, 48 kHz, 96 kHz, …) |
| **Format** | Convert between MP3, FLAC, WAV, OGG, M4A, AAC, AIFF with quality control |
| **Metadata** | Edit ID3/Vorbis tags, embed cover art, batch rename with token patterns, set track numbers |
| **History** | Undo any conversion or rename operation |
| **Settings** | Language, defaults, Windows Explorer shell extension, auto-update |

**Additional highlights**

- Drag-and-drop folders directly onto the file list in any tab
- Right-click any audio file or folder in Windows Explorer → **LocalPrep** context menu
- Audio preview player with volume control
- Sortable, resizable, reorderable columns (state persisted between sessions)
- Single-instance: opening a second instance focuses the existing window
- Auto-update via GitHub Releases (installer builds only)

---

## Supported formats

`.mp3` · `.flac` · `.wav` · `.ogg` · `.m4a` · `.aac` · `.aiff` · `.aif`

---

## Requirements

- **Windows** 10 / 11
- ffmpeg is bundled — no separate installation needed

---

## Installation

### Installer (recommended)

Download `LocalPrep-Setup-x.x.x.exe` from the [Releases](https://github.com/yyusvf/LocalPrep/releases) page and run it.

- Installs per-user (no admin required)
- Receives automatic updates
- Optionally registers the Windows Explorer context menu

### Run from source

```bash
git clone https://github.com/yyusvf/LocalPrep.git
cd LocalPrep
npm install
npm start
```

---

## Building

```bash
npm run build          # produces installer in dist/
```

Requires `electron-builder`. The CI pipeline (`.github/workflows/build.yml`) builds and publishes automatically on `v*` tags.

---

## Windows Explorer shell extension

After installing, go to **Settings → System Integration** and click **Register** to add a "LocalPrep" submenu to the right-click menu for audio files and folders.

This writes to `HKCU\Software\Classes\SystemFileAssociations` — no admin rights required.

---

## Project structure

```
LocalPrep/
├── main.js                  Electron main process
├── preload.js               Context bridge (IPC surface)
├── backend/
│   ├── fileScanner.js       Audio file discovery + metadata reading
│   ├── converterSR.js       Sample-rate conversion (ffmpeg)
│   ├── converterFormat.js   Format conversion (ffmpeg)
│   ├── metadataWriter.js    Tag writing + batch rename
│   ├── history.js           Undo history
│   ├── shellExtension.js    Windows registry shell extension
│   ├── ffmpeg.js            ffmpeg path resolver
│   └── store.js             Persistent settings (electron-store)
├── renderer/
│   ├── index.html
│   ├── js/
│   │   ├── app.js           Entry point, global utilities
│   │   ├── nav.js           Tab navigation
│   │   ├── player.js        Audio preview player
│   │   ├── icons.js         SVG icon library
│   │   ├── i18n.js          Internationalisation
│   │   ├── components/      FileTable, Modal, ContextMenu
│   │   └── tabs/            sample-rate, format, metadata, history, settings
│   └── css/                 Design system + tab styles
├── .github/workflows/
│   └── build.yml            CI/CD — build & publish on version tags
├── installer.iss            Inno Setup script (alternative installer)
└── package.json
```

---

## Auto-update

LocalPrep uses `electron-updater` to check for new GitHub Releases on startup (silent, background check). When an update is downloaded a banner appears in the UI with a "Restart & Install" button.

You can also check manually via **Settings → Updates → Check for Updates**.

> Auto-update is only available in the NSIS installer build. Portable builds and dev-mode runs show a notice instead.

---

## License

[MIT](LICENSE) © 2026 yyusvf
