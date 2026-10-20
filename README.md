# WebCut

WebCut is a Chrome extension that saves a rendered web page or selected component as a local standalone HTML snapshot.

## What it does

WebCut injects a toolbar into normal web pages. It can capture the whole page or one selected component. It collects page DOM, accessible stylesheet rules, supported media, and a screenshot, then stores the result in Chrome local storage. The popup starts captures and edits two settings. The side panel and in-page drawer show saved captures with search, recent items, previews, downloads, deletion, and folders.

## What it does not do

- It saves a rendered snapshot, not the original source code or application state.
- It does not preserve page JavaScript, inline event handlers, or interactive behavior in the saved document.
- It has no backend and does not upload captures.
- Output can differ on sites that use protected resources, unusual layout systems, or browser-specific behavior.
- Protected images may remain as external links. Protected stylesheets can be omitted and reported as warnings when WebCut cannot collect or fetch them.

## Features

- Full-page capture with overlapping scroll steps.
- Component selection with hover targeting and Arrow Up / Arrow Down navigation.
- CSS collection and URL absolutization.
- Resource inlining for supported images, canvas content, fonts, and CSS URLs within size and time limits.
- Screenshot capture with crop handling and restoration of the original scroll position.
- Script, stylesheet link, preload, and event-handler removal from the saved clone.
- Secure extension-page preview with a sandboxed preview document.
- HTML download with the name `WebCut-<website>.html`.
- Popup counters, capture buttons, settings, and local data clearing.
- Side panel and in-page drawer with search, recent grouping, folders, preview, download, and delete actions.

## Setup

1. Use Node 24.20.0 from `.nvmrc`, or another Node release that satisfies `>=20`.
2. Install the dependency-free project from a clean checkout:

   ```bash
   npm ci
   ```

3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Choose **Load unpacked**.
6. Select the `webcut/` folder in this repository.

## Run

Open a normal `http` or `https` page and click the WebCut extension icon. The extension runs in Chrome after loading `webcut/` as an unpacked extension. The automated tests do not need a browser.

## Test

Run the test-file runner and JavaScript syntax checker from the repository root:

```bash
npm test
npm run check
```

`npm test` runs every `*.test.js` file under `webcut/test` with the current Node executable. `npm run check` runs `node --check` on project JavaScript while skipping `.git`, `node_modules`, and `.opencode`.

## Docker

Build and run the test container from the repository root:

```bash
docker build -t webcut .
docker run --rm webcut
```

The Docker image uses `node:24-slim` and runs `npm test`. Docker was not available in the development environment for this step.

## Settings

See [`.env.example`](.env.example). WebCut does not need environment variables or secrets. The only optional user setting is `hostUrl`, which is entered in the popup settings and is stored there; it is not an environment variable and is not used by the current extension code.

## Usage

- **Clone Full Page** starts a page capture and saves it when the pipeline finishes.
- **Clone Component** enters selection mode. Hover an element, use Arrow Up / Arrow Down, then click or press Enter.
- After a capture, WebCut opens a preview. Use **Download HTML** to save the standalone document.
- Open **Saved Items** from the popup or toolbar. Search matches saved titles and URLs.
- Recent captures can expand into Today, Yesterday, and Earlier groups.
- Folders support create, rename, delete, add, and remove operations. Deleting a folder keeps its captures.
- Enable **Use the in-page drawer instead of the side panel** in popup settings when the saved-items UI should open over the current page.
- **Clear all data** removes saved pages, screenshots, and folders but keeps settings.

## File naming

Page captures use `WebCut-<website>.html`, where the website is the normalized HTTP(S) hostname without a leading `www.`. The fallback name is `WebCut-page.html`.

## Project structure

- `README.md` — user-facing project documentation.
- `SPEC.md` — current architecture, message contract, storage shapes, and security decisions.
- `LICENSE` — MIT license text.
- `package.json` — dependency-free Node metadata and `test` / `check` scripts.
- `package-lock.json` — npm lockfile for the empty dependency graph.
- `scripts/run-tests.js` — Node test-file runner.
- `scripts/check-syntax.js` — Node syntax-check runner.
- `.nvmrc` — pinned Node 24.20.0 runtime version.
- `Dockerfile` — Node 24 test image.
- `.dockerignore` — Docker context exclusions.
- `.env.example` — comment-only settings and secret guidance.
- `.gitignore` — local, generated, and secret-file exclusions.
- `webcut/` — Chrome extension source.
- `webcut/README.md` — three-line pointer back to this document.
- `webcut/manifest.json` — Manifest V3 metadata, permissions, entry points, and exposed extension resources.
- `webcut/background.js` — service worker, message routing, storage operations, tab access, resource fetching, and screenshot cropping.
- `webcut/content.js` — page toolbar, component selection, capture pipeline, preview modal, and in-page drawer.
- `webcut/content.css` — Shadow DOM toolbar, preview modal, selection overlays, and drawer styles.
- `webcut/popup.html` — popup markup.
- `webcut/popup.css` — popup styles.
- `webcut/popup.js` — popup actions, settings debounce, counters, and clear-data flow.
- `webcut/sidepanel.html` — saved-items side panel markup.
- `webcut/sidepanel-iframe.html` — the same saved-items markup for the in-page drawer iframe.
- `webcut/sidepanel.css` — side panel and drawer UI styles.
- `webcut/sidepanel.js` — saved items, search, recent groups, folders, previews, downloads, deletes, and live updates.
- `webcut/preview-frame.html` — extension page that receives preview HTML and creates the sandboxed inner frame.
- `webcut/preview-frame.js` — validates preview messages and assigns the sandboxed frame document.
- `webcut/shared/messages.js` — shared message names, storage keys, and default settings.
- `webcut/shared/clone-logic.js` — pure clone, CSS, filename, byte-formatting, and preview-title helpers.
- `webcut/shared/selection-logic.js` — pure component selection helpers.
- `webcut/shared/toolbar-state.js` — pure toolbar state transitions.
- `webcut/shared/popup-logic.js` — pure popup counters, URL validation, and error text helpers.
- `webcut/shared/sidepanel-logic.js` — pure saved-item, date, site-name, and folder helpers.
- `webcut/icons/` — extension icon directory.
- `webcut/icons/icon-16.png` — 16px extension icon.
- `webcut/icons/icon-32.png` — 32px extension icon.
- `webcut/icons/icon-48.png` — 48px extension icon.
- `webcut/icons/icon-128.png` — 128px extension icon.
- `webcut/test/` — Node test files and the manual fixture `sample.html`.
- `webcut/test/background-handlers.test.js` — background message, tab, fetch, and screenshot tests.
- `webcut/test/clone-logic.test.js` — pure clone and CSS helper tests.
- `webcut/test/popup-logic.test.js` — pure popup helper tests.
- `webcut/test/selection-logic.test.js` — pure selection helper tests.
- `webcut/test/sidepanel-logic.test.js` — pure recent, date, site, and folder helper tests.
- `webcut/test/storage.test.js` — storage and folder handler tests.
- `webcut/test/toolbar-state.test.js` — toolbar transition tests.
- `webcut/test/sample.html` — offline-friendly manual capture fixture.

## Message contract summary

All runtime message names come from `webcut/shared/messages.js`. The background service worker returns `{ok:true,...}` for successful handlers and `{ok:false,error}` for failures.

| Message | Request | Main response |
| --- | --- | --- |
| `openTab` | `{url}` | `{tabId}` |
| `fetchResource` | `{url, as}` | `{status, text}` or `{status, dataUrl}` |
| `takeScreenshot` | `{rect, dpr}` | `{dataUrl}` |
| `savePage` | `{meta, html, screenshot?}` | `{id}` |
| `getPages` | `{limit?}` | `{pages}` |
| `getPageContent` | `{id}` | `{value}` |
| `getScreenshot` | `{id}` | `{value}` |
| `deletePage` | `{id}` | `{}` |
| `clearAllData` | `{}` | `{}` |
| `getSettings` | `{}` | `{settings}` |
| `saveSettings` | `{settings}` | `{settings}` |
| `getFolders` | `{}` | `{folders}` |
| `createFolder` | `{name}` | `{folder}` |
| `renameFolder` | `{id, name}` | `{folder}` |
| `deleteFolder` | `{id}` | `{}` |
| `addToFolder` | `{folderId, pageId}` | `{}` |
| `removeFromFolder` | `{folderId, pageId}` | `{}` |
| `toggleToolbar` | `{tabId?, action?}` | `{visible, busy?}` |
| `toggleDrawer` | `{tabId?}` | `{visible}` |

`toggleToolbar.action` is `page` or `component`. `toggleToolbar` and `toggleDrawer` also report background reasons such as `restricted`, `no-tab`, `url-unknown`, `inject-failed`, and `no-receiver` when tab delivery fails.

## Storage keys and shapes

- `local:pages` — metadata array with `id`, `type`, `url`, `title`, `savedAt`, and `fileName`.
- `local:page-content:<id>` — saved HTML string for one capture.
- `local:screenshot-data:<id>` — optional screenshot data URL for one capture.
- `local:user-settings` — `{hostUrl, useContentSidePanel}`. The default is `{hostUrl: "", useContentSidePanel: false}`.
- `local:folders` — folder array with `id`, `name`, `itemIds`, `createdAt`, and `isDefault`.

## Permissions and why they are needed

- `storage` — store metadata, HTML, screenshots, settings, and folders locally.
- `unlimitedStorage` — allow larger local capture collections than the normal extension quota.
- `sidePanel` — open Chrome's side panel from the popup.
- `scripting` — inject the content dependencies when a tab has no active content-script receiver.
- `activeTab` — address the tab selected by a user capture action.
- `<all_urls>` host permission — run the content script on ordinary pages and fetch HTTP(S) resources that belong to the page being captured.

## Privacy and network behaviour

Captures, screenshots, settings, and folder data stay in `chrome.storage.local`. The extension has no server or upload path. `fetchResource` only downloads HTTP(S) resources encountered during the current page capture; it omits credentials, follows redirects, and applies a 15 MB resource limit and a 15 second timeout. The optional `hostUrl` value is validated as HTTPS and stored in settings, but no current extension code uses it for a request.

## Manual extension checklist

1. Load `webcut/` as an unpacked extension.
2. Open `webcut/test/sample.html` from a local web server or a local file page where Chrome permits the extension.
3. Start **Clone Full Page** and confirm the long page, canvas, SVG, CSS background, and lazy image are represented.
4. Confirm the deliberate inline button handler is absent from the saved HTML.
5. Start **Clone Component**, use Arrow Up / Arrow Down, confirm a component, and inspect its preview and download.
6. Search saved titles and URLs in the side panel.
7. Create, rename, delete, and populate folders. Confirm removing an item from a folder does not delete the capture.
8. Switch between the side panel and in-page drawer setting.
9. Clear data and confirm settings remain.

## Limitations and known issues

- The result is a static snapshot. It is not a source-code export.
- Page scripts and inline event-handler attributes are removed from captured clones.
- Cross-origin or protected CSS can fail collection and be omitted, while protected media can remain linked; screenshot or canvas capture can fail for individual resources.
- Sites with unusual browser APIs, closed shadow roots, cross-origin frames, or aggressive runtime rendering can produce partial snapshots.
- Chrome browser-owned pages and store pages are rejected by the restricted-URL check.
- The optional `hostUrl` setting is stored but not connected to a service.
- The automated command is not wired to `npm test` until step 12.

## Credits

Inspired by existing page-capture tools; code written from scratch. The project was built step by step with an AI agent and numbered git tags. Tags through `step-11` are present, this step adds `step-12`, and the workflow is planned to continue through `step-13`.

## License

MIT License. See [`LICENSE`](LICENSE).
