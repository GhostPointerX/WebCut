# Changelog

## 1.0.0

- Added full-page and component capture with DOM, stylesheet, media, and screenshot handling.
- Added popup capture controls, saved counters, HTTPS host setting validation, and local data clearing.
- Added side panel and in-page drawer with search, recent groups, previews, downloads, deletes, and folders.
- Added sandboxed script-free previews and local HTML downloads.
- Added Node test and syntax-check runners, a pinned runtime, Docker test configuration, and a manual capture fixture.

Known limitations: captures are rendered snapshots, page scripts and event handlers are removed, protected or cross-origin resources can be omitted or remain linked, and Docker was not available in the development environment for local testing.
