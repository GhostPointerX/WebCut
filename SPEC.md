# WebCut specification

This document describes the implementation in `webcut/` at Step 11. It records the current architecture and known boundaries.

## Components

- `webcut/manifest.json` — Manifest V3 entry points, permissions, content-script dependencies, and web-accessible resources.
- `webcut/background.js` — service worker. It owns storage, resource fetches, screenshot capture, restricted-URL checks, tab delivery, and message dispatch.
- `webcut/content.js` — content-script runtime. It creates the Shadow DOM toolbar, selection overlays, capture pipeline, preview modal, and in-page drawer.
- `webcut/content.css` — styles inside the content-script Shadow DOM.
- `webcut/popup.html`, `popup.css`, `popup.js` — popup interface for capture starts, saved counts, settings, side-panel choice, and clearing data.
- `webcut/sidepanel.html`, `sidepanel.css`, `sidepanel.js` — saved-items interface for the Chrome side panel.
- `webcut/sidepanel-iframe.html` — the same saved-items interface loaded inside the content drawer iframe.
- `webcut/preview-frame.html`, `preview-frame.js` — extension-page preview receiver. It creates a second iframe with an empty sandbox attribute and assigns `srcdoc`.
- `webcut/shared/messages.js` — shared message names, storage keys, and default settings.
- `webcut/shared/clone-logic.js` — pure clone and serialization helpers.
- `webcut/shared/selection-logic.js` — pure selection navigation and element-description helpers.
- `webcut/shared/toolbar-state.js` — pure `idle`, `selecting`, and `exporting` state transitions.
- `webcut/shared/popup-logic.js` — pure popup count, HTTPS URL normalization, and error helpers.
- `webcut/shared/sidepanel-logic.js` — pure saved-item, time, site-name, and folder helpers.
- `webcut/test/` — plain Node test files and the manual capture fixture.

## Capture pipeline

1. The popup sends `toggleToolbar` with `action: "page"` or `action: "component"`. The background `sendToTab()` checks the tab URL, sends the message, and calls `injectContent()` when the receiver is missing.
2. The content listener makes the Shadow DOM host visible. A page action calls `startExport('page', null)`. A component action calls `beginSelection()` and enters selection mode.
3. `startExport()` calls `captureParts()`. Page mode calls `performAutoScroll()` before cloning. Component mode uses the selected element.
4. `captureParts()` calls `cloneForCapture()`, `buildMediaPairs()`, `cleanDomNode()`, and `collectCss()`.
5. `cleanDomNode()` removes `script`, `noscript`, `style`, `base`, stylesheet and preload links, module-preload links, the WebCut host, and event-handler attributes. It changes `javascript:` URL attributes to `#`.
6. Styles are collected from document and adopted stylesheets. `inlineCss()` uses `findCssUrls()` and `replaceCssUrls()`. `inlineImages()` handles image, video poster, canvas, and related media paths through the resource manager.
7. Component mode serializes through `buildComponentDocument()`. Page mode ensures a `head`, calls `resetHead()`, inserts charset, base, and merged CSS, then prefixes the serialized clone with `<!doctype html>`.
8. `captureScreenshot()` records the original scroll position. Component mode centers an off-screen element and waits briefly. Page mode scrolls to the top. WebCut hides its host and selection overlays, calls `takeScreenshot`, and restores scroll and visibility in `finally`.
9. The background `takeScreenshot()` calls `chrome.tabs.captureVisibleTab()`, calculates a crop with `computeCropRect()`, and returns a PNG data URL.
10. `startExport()` sends `savePage`. The background writes metadata, HTML, and an optional screenshot through `withLock()`, a serialized promise queue.
11. The content preview uses `openPreviewModal()`. It loads `preview-frame.html`, then posts `{type: "webcut-preview", html}` to the extension origin. The receiver validates the message shape and source, then assigns the HTML to a sandboxed inner iframe.
12. The side panel reads `getPages` and `getFolders`. It renders recent groups, search results, folders, previews, downloads, deletes, and folder links. The in-page drawer uses the same side-panel iframe document.

## Message contract

All messages are declared in `webcut/shared/messages.js`. Background errors are returned as `{ok:false,error}`. Successful handler results are wrapped as `{ok:true,...}`.

| Type | Request fields | Response fields |
| --- | --- | --- |
| `openTab` | `url` | `tabId` |
| `fetchResource` | `url`, `as: "text" | "dataUrl"` | `status`, plus `text` or `dataUrl` |
| `takeScreenshot` | `rect`, `dpr` | `dataUrl` |
| `savePage` | `meta`, `html`, optional `screenshot` | `id` |
| `getPages` | optional `limit` | `pages` |
| `getPageContent` | `id` | `value` |
| `getScreenshot` | `id` | `value` |
| `deletePage` | `id` | empty result |
| `clearAllData` | none | empty result |
| `getSettings` | none | `settings` |
| `saveSettings` | `settings` | `settings` |
| `getFolders` | none | `folders` |
| `createFolder` | `name` | `folder` |
| `renameFolder` | `id`, `name` | `folder` |
| `deleteFolder` | `id` | empty result |
| `addToFolder` | `folderId`, `pageId` | empty result |
| `removeFromFolder` | `folderId`, `pageId` | empty result |
| `toggleToolbar` | optional `tabId`, optional `action` | `visible`, optional `busy` |
| `toggleDrawer` | optional `tabId` | `visible` |

`toggleToolbar.action` accepts `page` and `component`. Tab delivery can return `reason` values for restricted pages, missing tabs, loading URLs, injection failures, and missing receivers.

## Storage keys and shapes

The names are defined by `WC.KEYS` in `webcut/shared/messages.js`.

| Key | Shape | Owner |
| --- | --- | --- |
| `local:pages` | Array of `{id, type, url, title, savedAt, fileName}` | `savePage`, `getPages`, `deletePage` |
| `local:page-content:<id>` | HTML string | `savePage`, `getPageContent`, `deletePage` |
| `local:screenshot-data:<id>` | Optional image data URL | `savePage`, `getScreenshot`, `deletePage` |
| `local:user-settings` | `{hostUrl: string, useContentSidePanel: boolean}` | `getSettings`, `saveSettings` |
| `local:folders` | Array of `{id, name, itemIds, createdAt, isDefault}` | folder handlers |

The background creates and protects a `default` folder. Folder writes and page writes use `withLock()` to serialize storage mutations. Deleting a page removes its folder links. Deleting a folder leaves its pages intact.

## Security decisions

- The page UI is isolated in an open Shadow DOM attached to `webcut-ui-root`.
- Captured clones remove scripts, event-handler attributes, and executable `javascript:` URLs.
- The preview receiver places captured HTML in an iframe with an empty `sandbox` attribute. No script or same-origin permission is added to that frame.
- The content script sends preview data to the extension origin rather than using a wildcard target.
- Resource fetches use `credentials: "omit"`, accept only HTTP(S) URLs, follow redirects, and enforce size and timeout limits.
- `sendToTab()` rejects browser-owned schemes and Chrome Web Store pages before delivery.
- Storage mutations are serialized by `withLock()` to reduce concurrent-write loss.
- Dynamic extension UI text uses `textContent`; the extension code does not use `eval` or dynamic `innerHTML`.
- The side-panel saved HTML preview uses `srcdoc` only in an empty-sandbox iframe.

## Known limitations

- The capture is a rendered document snapshot. Source modules, runtime state, event listeners, and page scripts are not restored.
- Cross-origin stylesheets can deny CSSOM access. WebCut tries `fetchResource()` for HTTP(S) sheets, but a failure leaves a warning and the stylesheet can be omitted from the clone.
- Protected images, fonts, canvas content, and resources above the configured limits can remain linked or be omitted.
- Cross-origin iframes are not recursively cloned.
- Browser-owned and store pages are rejected by `isRestrictedUrl()`.
- `hostUrl` is validated and stored but has no consumer in the current code.
- `npm test` is a documentation placeholder until the test command is added in Step 12.
