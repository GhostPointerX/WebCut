<div align="center">

<img src="https://i.ibb.co/q34dNf6s/icon-128.png" alt="WebCut logo" width="96" height="96">

# WebCut

### Capture a page. Keep a clean snapshot.

A Chrome extension for saving a webpage—or a selected component—as a downloadable HTML snapshot.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://github.com/zaidsamii/WebCut)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/version-1.0.0-7C3AED)](https://github.com/zaidsamii/WebCut/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[Features](#-features) · [Get started](#-get-started) · [How to use](#-how-to-use) · [Privacy](#-privacy-first) · [Development](#-development)

</div>

---

## What is WebCut?

WebCut captures the **rendered appearance** of a webpage or a component you select, then saves it as an HTML file.

Capture a full page, select a specific section, preview the result, and download it. Saved captures stay in Chrome's local storage. WebCut has no backend and does not upload your captures.

> WebCut saves a rendered snapshot. It does not export a website's original source code or preserve the page's interactive behavior.

## ✨ Features

| Capture | Manage | Local by design |
| --- | --- | --- |
| Capture a full page with overlapping scroll steps | Search captures by title or URL | Store captures in Chrome local storage |
| Select a component by hovering and navigating the page | Organize captures into folders | No account, backend, or upload flow |
| Collect accessible CSS and supported media | Preview, download, or delete captures | Show previews in a sandboxed frame |

More included:

- Inline supported images, canvas content, fonts, and CSS resources within configured limits.
- Remove scripts and inline event handlers from saved HTML.
- Save an optional screenshot with each capture.
- Open saved items in Chrome's side panel or in-page drawer.
- Browse recent captures grouped by Today, Yesterday, and Earlier.

## 🚀 Get started

WebCut runs in Chrome as an unpacked extension.

1. Clone or download this repository.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `webcut/` folder in this repository.
6. Open a regular webpage and click the WebCut extension icon.

No build step is required to load the extension.

## How to use

### Capture a full page

1. Open the webpage you want to capture.
2. Click the WebCut extension icon.
3. Choose **Clone Full Page**.
4. Preview the snapshot, then choose **Download HTML** to save it.

### Capture a component

1. Choose **Clone Component**.
2. Hover over the page to target an element.
3. Use **Arrow Up** or **Arrow Down** to change the selection.
4. Click the component or press **Enter** to capture it.
5. Preview or download the snapshot.

### Manage saved captures

Open **Saved Items** from the popup or toolbar to search, preview, download, delete, and organize captures.

Folders can be created, renamed, and deleted. Deleting a folder keeps the captures inside it.

## 🔒 Privacy first

- Captures, screenshots, settings, and folders are stored in `chrome.storage.local`.
- WebCut does not upload captures to a server.
- During capture, WebCut may fetch HTTP or HTTPS resources found on the page to include supported assets. Requests omit credentials and use size and timeout limits.
- The optional `hostUrl` setting is stored, but is not connected to a service.

## What to expect

WebCut creates a **static snapshot**, not a working copy of the original website. Page scripts, event handlers, and interactive behavior are not preserved.

Some content may be missing or look different when a site uses protected or cross-origin resources, unusual browser APIs, cross-origin frames, or browser-specific rendering. Protected media may remain linked to its original URL, and some stylesheets may not be available to capture.

Chrome browser pages and Chrome Web Store pages cannot be captured.

## 🧰 Development

### Prerequisites

Before getting started, ensure you have the following installed:

- **[Node.js](https://nodejs.org/)** `>=20`
- **npm**, included with Node.js
- **Git**, to clone the repository

> **Note:** The repository pins Node.js version `24.20.0` in the `.nvmrc` file. Using the specified version is recommended for a consistent development environment.

### Installation

1. Clone the repository and navigate to the project directory:

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

### Running Tests

Run the test suite to verify that the project is working correctly:

```bash
npm test
```

### Checking JavaScript Syntax

Check the JavaScript files for syntax errors:

```bash
npm run check
```

### Development Notes

- The project has no runtime or development npm dependencies.
- Tests run directly with Node.js and do not require Google Chrome.
- Use the Node.js version specified in `.nvmrc` for the most consistent results.

---

## 🔐 Permissions

WebCut requests the following Chrome extension permissions to provide its capture, storage, and preview functionality.

| Permission | Purpose |
|---|---|
| `storage` | Stores captures, screenshots, settings, and folders locally. |
| `unlimitedStorage` | Supports larger collections of locally saved captures. |
| `sidePanel` | Opens and displays saved items in Chrome's side panel. |
| `scripting` | Injects or executes scripts when required to start capture on a tab. |
| `activeTab` | Provides access to the tab selected by the user. |
| `<all_urls>` | Allows the extension to work across webpages and retrieve supported resources during capture. |

**Privacy note:** These permissions enable the extension's functionality. Actual data handling depends on the implementation of the capture and storage features.

---

## 📁 Project Structure

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

### Directory Overview

- **`scripts/`** — Contains utilities for running tests and checking JavaScript syntax.
- **`webcut/shared/`** — Holds reusable logic shared across capture and user-interface components.
- **`webcut/test/`** — Contains tests and fixtures for validating capture functionality.
- **`webcut/background.js`** — Handles background operations, including messaging, storage, resource fetching, and screenshots.
- **`webcut/content.js`** — Implements the in-page toolbar, selection tools, capture functionality, and drawer.
- **`webcut/popup.*`** — Contains the extension popup files.
- **`webcut/sidepanel.*`** — Contains the saved-capture interface and folder management files.
- **`webcut/preview-frame.*`** — Provides the sandboxed HTML preview interface.

---

## 📄 License

WebCut is released under the [MIT License](LICENSE).

You are free to use, modify, and distribute this software in accordance with the terms of the MIT License.
