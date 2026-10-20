'use strict';

var MSG = Object.freeze({
  // Request: { type: "openTab", url: string }; response: { ok: boolean, error?: string, tabId?: number }.
  openTab: 'openTab',
  // Request: { type: "fetchResource", url: string, as: "text"|"dataUrl" }; response: { ok: boolean, error?: string, status?: number, text?: string, dataUrl?: string }.
  fetchResource: 'fetchResource',
  // Request: { type: "takeScreenshot", rect: { x: number, y: number, width: number, height: number }, dpr: number }; response: { ok: boolean, error?: string, dataUrl?: string }.
  takeScreenshot: 'takeScreenshot',
  // Request: { type: "savePage", meta: { id?: string, type: "page"|"component", url: string, title: string, savedAt?: number, fileName: string }, html: string, screenshot?: string }; response: { ok: boolean, error?: string, id?: string }.
  savePage: 'savePage',
  // Request: { type: "getPages", limit?: number }; response: { ok: boolean, error?: string, pages?: object[] }.
  getPages: 'getPages',
  // Request: { type: "getPageContent", id: string }; response: { ok: boolean, error?: string, value?: string|null }.
  getPageContent: 'getPageContent',
  // Request: { type: "getScreenshot", id: string }; response: { ok: boolean, error?: string, value?: string|null }.
  getScreenshot: 'getScreenshot',
  // Request: { type: "deletePage", id: string }; response: { ok: boolean, error?: string }.
  deletePage: 'deletePage',
  // Request: { type: "clearAllData" }; response: { ok: boolean, error?: string }.
  clearAllData: 'clearAllData',
  // Request: { type: "getSettings" }; response: { ok: boolean, error?: string, settings?: object }.
  getSettings: 'getSettings',
  // Request: { type: "saveSettings", settings: { hostUrl: string, useContentSidePanel: boolean } }; response: { ok: boolean, error?: string, settings?: object }.
  saveSettings: 'saveSettings',
  // Request: { type: "getFolders" }; response: { ok: boolean, error?: string, folders?: object[] }.
  getFolders: 'getFolders',
  // Request: { type: "createFolder", name: string }; response: { ok: boolean, error?: string, folder?: object }.
  createFolder: 'createFolder',
  // Request: { type: "renameFolder", id: string, name: string }; response: { ok: boolean, error?: string, folder?: object }.
  renameFolder: 'renameFolder',
  // Request: { type: "deleteFolder", id: string }; response: { ok: boolean, error?: string }.
  deleteFolder: 'deleteFolder',
  // Request: { type: "addToFolder", folderId: string, pageId: string }; response: { ok: boolean, error?: string }.
  addToFolder: 'addToFolder',
  // Request: { type: "removeFromFolder", folderId: string, pageId: string }; response: { ok: boolean, error?: string }.
  removeFromFolder: 'removeFromFolder',
  // Request: { type: "toggleToolbar", tabId?: number, action?: "page"|"component" }; response: { ok: boolean, visible?: boolean, busy?: boolean, error?: string, reason?: "restricted"|"no-tab"|"url-unknown"|"inject-failed"|"no-receiver" }.
  toggleToolbar: 'toggleToolbar',
  // Request: { type: "toggleDrawer", tabId?: number }; response: { ok: boolean, error?: string, reason?: "restricted"|"no-tab"|"url-unknown"|"inject-failed"|"no-receiver" }.
  toggleDrawer: 'toggleDrawer'
});

var KEYS = {
  pages: 'local:pages',
  content: 'local:page-content:',
  screenshot: 'local:screenshot-data:',
  settings: 'local:user-settings',
  folders: 'local:folders',
  contentKey: function (id) {
    return 'local:page-content:' + String(id);
  },
  screenshotKey: function (id) {
    return 'local:screenshot-data:' + String(id);
  }
};
Object.freeze(KEYS);

var DEFAULT_SETTINGS = Object.freeze({
  hostUrl: '',
  useContentSidePanel: false
});

var WC = Object.freeze({
  MSG: MSG,
  KEYS: KEYS,
  DEFAULT_SETTINGS: DEFAULT_SETTINGS
});

if (typeof globalThis !== 'undefined') {
  globalThis.WC = WC;
} else if (typeof self !== 'undefined') {
  self.WC = WC;
}

if (typeof module !== 'undefined') module.exports = WC;
