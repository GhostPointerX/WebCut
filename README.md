<div align="center">

<img src="webcut/icons/icon-128.png" alt="WebCut logo" width="110" height="110">

# WebCut

### Capture a page. Keep a clean snapshot.

A Chrome extension that saves a webpage, or any selected component, as a clean, downloadable HTML snapshot.

<br>

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/zaidsamii/WebCut)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/version-1.0.0-7C3AED?style=for-the-badge)](https://github.com/zaidsamii/WebCut/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-F7DF1E?style=for-the-badge)](./LICENSE)

<br>

[🎬 Demo](#-demo) &nbsp;•&nbsp;
[✨ Features](#-features) &nbsp;•&nbsp;
[🚀 Get started](#-get-started) &nbsp;•&nbsp;
[📖 How to use](#-how-to-use) &nbsp;•&nbsp;
[🔒 Privacy](#-privacy-first) &nbsp;•&nbsp;
[🧰 Development](#-development)

</div>

---

## 💡 What is WebCut?

WebCut captures the **rendered appearance** of a webpage, or of a component you select, and saves it as an HTML file.

Capture a full page, pick a specific section, preview the result, and download it. Saved captures stay in Chrome's local storage. WebCut has no backend and never uploads your captures.

> [!IMPORTANT]
> WebCut saves a **rendered snapshot**. It does not export a website's original source code or preserve the page's interactive behavior.

---

## 🎬 Demo

<div align="center">

[![Watch the WebCut demo](https://img.youtube.com/vi/E-j-3u69mPo/maxresdefault.jpg)](https://youtu.be/E-j-3u69mPo)

**▶️ Click the thumbnail to watch the full demo on YouTube**

</div>

<br>

### 📺 Setup video

New to loading unpacked extensions? Watch the step-by-step setup walkthrough.

<div align="center">

[![Watch the WebCut setup guide](https://img.youtube.com/vi/6trQhV9-wx4/maxresdefault.jpg)](https://youtu.be/6trQhV9-wx4)

**▶️ Click the thumbnail to watch the setup guide on YouTube**

</div>

<table>
  <tr>
    <td align="center" width="50%">
      <a href="https://youtu.be/E-j-3u69mPo"><b>🎥 Watch Demo</b></a>
    </td>
    <td align="center" width="50%">
      <a href="https://youtu.be/6trQhV9-wx4"><b>🛠️ Watch Setup Guide</b></a>
    </td>
  </tr>
</table>

---

## ✨ Features

<table>
  <tr>
    <th width="33%">📸 Capture</th>
    <th width="33%">🗂️ Manage</th>
    <th width="33%">🛡️ Local by design</th>
  </tr>
  <tr>
    <td valign="top">
      • Capture a full page with overlapping scroll steps<br><br>
      • Select a component by hovering and navigating the page<br><br>
      • Collect accessible CSS and supported media
    </td>
    <td valign="top">
      • Search captures by title or URL<br><br>
      • Organize captures into folders<br><br>
      • Preview, download, or delete captures
    </td>
    <td valign="top">
      • Store captures in Chrome local storage<br><br>
      • No account, backend, or upload flow<br><br>
      • Previews shown in a sandboxed frame
    </td>
  </tr>
</table>

### Also included

- 🖼️ Inline supported images, canvas content, fonts, and CSS resources within configured limits
- 🧹 Scripts and inline event handlers are removed from saved HTML
- 📷 Optional screenshot saved with each capture
- 📑 Open saved items in Chrome's side panel or in-page drawer
- 🕒 Recent captures grouped by **Today**, **Yesterday**, and **Earlier**

---

## 🚀 Get started

WebCut runs in Chrome as an unpacked extension. **No build step is required.**

| Step | Action |
| :--: | ------ |
| **1** | Clone or download this repository |
| **2** | In Chrome, open `chrome://extensions` |
| **3** | Turn on **Developer mode** |
| **4** | Click **Load unpacked** |
| **5** | Select the `webcut/` folder in this repository |
| **6** | Open a regular webpage and click the WebCut extension icon |

> [!TIP]
> Stuck on any step? Watch the [setup video](https://youtu.be/6trQhV9-wx4).

---

## 📖 How to use

### 🖥️ Capture a full page

1. Open the webpage you want to capture.
2. Click the WebCut extension icon.
3. Choose **Clone Full Page**.
4. Preview the snapshot, then choose **Download HTML** to save it.

### 🎯 Capture a component

1. Choose **Clone Component**.
2. Hover over the page to target an element.
3. Use <kbd>↑</kbd> / <kbd>↓</kbd> (Arrow Up / Arrow Down) to change the selection.
4. Click the component or press <kbd>Enter</kbd> to capture it.
5. Preview or download the snapshot.

### 📚 Manage saved captures

Open **Saved Items** from the popup or toolbar to search, preview, download, delete, and organize captures.

> [!NOTE]
> Folders can be created, renamed, and deleted. Deleting a folder keeps the captures inside it.

---

## 🔒 Privacy first

- Captures, screenshots, settings, and folders are stored in `chrome.storage.local`.
- WebCut does **not** upload captures to a server.
- During capture, WebCut may fetch HTTP or HTTPS resources found on the page to include supported assets. Requests omit credentials and use size and timeout limits.
- The optional `hostUrl` setting is stored, but is not connected to a service.

---

## ⚠️ What to expect

WebCut creates a **static snapshot**, not a working copy of the original website. Page scripts, event handlers, and interactive behavior are not preserved.

Some content may be missing or look different when a site uses:

- protected or cross-origin resources
- unusual browser APIs
- cross-origin frames
- browser-specific rendering

Protected media may remain linked to its original URL, and some stylesheets may not be available to capture.

> [!WARNING]
> Chrome browser pages (`chrome://`) and Chrome Web Store pages cannot be captured.

---

## 🧰 Development

### Prerequisites

- **[Node.js](https://nodejs.org/)** `24.20.0`
- **npm** (included with Node.js)
- **Git** (to clone the repository)

> [!NOTE]
> The repository pins Node.js `24.20.0` in `.nvmrc`, `package.json`, and the Dockerfile.

### Installation

```bash
git clone https://github.com/zaidsamii/WebCut.git
cd WebCut
npm ci
```

### Running the extension

WebCut is a Chrome extension, so it runs by loading the repository's `webcut/` directory as an unpacked extension (see [Get started](#-get-started)). There is no local web server or separate application process to start.

### Commands

| Command | Description |
| ------- | ----------- |
| `npm test` | Run the test suite to verify the project works correctly |
| `npm run check` | Check the JavaScript files for syntax errors |

### 🐳 Rebuild check in Docker

The Dockerfile uses the pinned Node.js runtime, installs from `package-lock.json`, checks JavaScript syntax during the image build, and runs the test suite when the container starts:

```bash
docker build -t webcut .
docker run --rm webcut
```

### Development notes

- The project has no runtime or development npm dependencies.
- Tests run directly with Node.js and do not require Google Chrome.
- Use the Node.js version specified in `.nvmrc` for the most consistent results.

---

## 🔐 Permissions

WebCut requests the following Chrome extension permissions for capture, storage, and preview.

| Permission | Purpose |
| ---------- | ------- |
| `storage` | Stores captures, screenshots, settings, and folders locally |
| `unlimitedStorage` | Supports larger collections of locally saved captures |
| `sidePanel` | Opens and displays saved items in Chrome's side panel |
| `scripting` | Injects or executes scripts when required to start capture on a tab |
| `activeTab` | Provides access to the tab selected by the user |
| `<all_urls>` | Allows the extension to work across webpages and retrieve supported resources during capture |

> [!NOTE]
> These permissions enable the extension's functionality. Actual data handling depends on the implementation of the capture and storage features.

---

## 📁 Project structure

```text
.
├── scripts/
│   ├── run-tests.js          # Node.js test runner
│   └── check-syntax.js       # JavaScript syntax checker
└── webcut/
    ├── shared/               # Shared capture, selection, and UI logic
    ├── test/                 # Node.js tests and manual capture fixtures
    ├── background.js         # Messaging, storage, resource fetching, and screenshots
    ├── content.js            # Toolbar, selection, capture, and in-page drawer
    ├── popup.*               # Extension popup interface
    ├── sidepanel.*           # Saved captures and folder management
    └── preview-frame.*       # Sandboxed HTML preview
```

<details>
<summary><b>Directory overview</b></summary>

<br>

- **`scripts/`**: utilities for running tests and checking JavaScript syntax.
- **`webcut/shared/`**: reusable logic shared across capture and user-interface components.
- **`webcut/test/`**: tests and fixtures for validating capture functionality.
- **`webcut/background.js`**: background operations, including messaging, storage, resource fetching, and screenshots.
- **`webcut/content.js`**: in-page toolbar, selection tools, capture functionality, and drawer.
- **`webcut/popup.*`**: extension popup files.
- **`webcut/sidepanel.*`**: saved-capture interface and folder management files.
- **`webcut/preview-frame.*`**: sandboxed HTML preview interface.

</details>

---

## 📄 License

WebCut is released under the [MIT License](LICENSE). You are free to use, modify, and distribute this software in accordance with its terms.

<div align="center">

<br>

**If WebCut helps you, consider giving the repo a ⭐**

<sub>Made with ❤️ by <a href="https://github.com/zaidsamii">zaidsamii</a></sub>

</div>
