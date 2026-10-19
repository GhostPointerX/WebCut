if (typeof importScripts === 'function') importScripts('shared/messages.js');

const CONTRACT = typeof module !== 'undefined' && module.exports && typeof require === 'function'
  ? require('./shared/messages.js')
  : (typeof globalThis !== 'undefined' ? globalThis.WC : self.WC);

const MESSAGE_MAP = CONTRACT.MSG;
const STORAGE_MAP = CONTRACT.KEYS;
const PAGE_KEY = STORAGE_MAP.pages;
const DEFAULT_FOLDER_ID = 'default';
const USER_DEFAULT_SETTINGS = { ...CONTRACT.DEFAULT_SETTINGS };
let lockTail = Promise.resolve();
let fallbackId = 0;

function storage() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    throw new Error('chrome.storage.local is unavailable');
  }
  return chrome.storage.local;
}

function storageCall(method, args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const callback = (value) => {
      const lastError = typeof chrome !== 'undefined' && chrome.runtime
        ? chrome.runtime.lastError
        : null;
      if (lastError) finish(new Error(lastError.message || String(lastError)));
      else finish(null, value);
    };

    let result;
    try {
      result = method.apply(storage(), [...args, callback]);
    } catch (error) {
      finish(error);
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then((value) => finish(null, value), (error) => finish(error));
    }
  });
}

function storageGet(key) {
  return storageCall(storage().get, [key]).then((value) => value || {});
}

function storageSet(values) {
  return storageCall(storage().set, [values]).then(() => undefined);
}

function storageRemove(keys) {
  return storageCall(storage().remove, [keys]).then(() => undefined);
}

function withLock(fn) {
  if (typeof fn !== 'function') return Promise.reject(new TypeError('withLock requires a function'));
  const run = lockTail.then(() => fn());
  lockTail = run.then(() => undefined, () => undefined);
  return run;
}

function makeId() {
  const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  fallbackId += 1;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${fallbackId}`;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function id(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('id is required');
  return value.trim();
}

function pagesFrom(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Stored pages must be an array');
  return value.slice();
}

function foldersFrom(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Stored folders must be an array');
  return value.map((folder) => {
    object(folder, 'folder');
    const folderId = id(folder.id);
    const name = folder.name;
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 40) {
      throw new Error('Folder name must be 1-40 characters');
    }
    if (folder.createdAt !== undefined && (!Number.isFinite(folder.createdAt) || folder.createdAt < 0)) {
      throw new Error('folder.createdAt must be a timestamp');
    }
    return {
      id: folderId,
      name: folderId === DEFAULT_FOLDER_ID ? 'Default' : name.trim(),
      itemIds: Array.isArray(folder.itemIds) ? [...new Set(folder.itemIds.filter((pageId) => typeof pageId === 'string'))] : [],
      createdAt: folder.createdAt === undefined ? Date.now() : folder.createdAt,
      isDefault: folderId === DEFAULT_FOLDER_ID,
    };
  });
}

function folderList(value) {
  const stored = foldersFrom(value);
  const storedDefault = stored.find((folder) => folder.id === DEFAULT_FOLDER_ID);
  const defaultFolder = storedDefault || {
    id: DEFAULT_FOLDER_ID,
    name: 'Default',
    itemIds: [],
    createdAt: Date.now(),
    isDefault: true,
  };
  const folders = stored
    .filter((folder) => folder.id !== DEFAULT_FOLDER_ID)
    .map((folder) => ({ ...folder, isDefault: false }));
  return [{ ...defaultFolder, name: 'Default', isDefault: true }, ...folders];
}

function folderName(value) {
  if (typeof value !== 'string') throw new Error('Folder name must be a string');
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 40) throw new Error('Folder name must be 1-40 characters');
  return trimmed;
}

function assertUniqueFolderName(folders, name, exceptId) {
  const normalized = name.toLocaleLowerCase();
  if (folders.some((folder) => folder.id !== exceptId && folder.name.toLocaleLowerCase() === normalized)) {
    throw new Error('Folder name must be unique');
  }
}

function validSettingsPatch(value) {
  object(value, 'settings');
  const patch = {};
  for (const key of Object.keys(value)) {
    if (key !== 'hostUrl' && key !== 'useContentSidePanel') {
      throw new Error(`Unknown setting: ${key}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'hostUrl')) {
    if (typeof value.hostUrl !== 'string') throw new Error('hostUrl must be a string');
    if (value.hostUrl !== '') {
      let parsed;
      try {
        parsed = new URL(value.hostUrl);
      } catch (error) {
        throw new Error('hostUrl must be an https URL');
      }
      if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error('hostUrl must be an https URL');
    }
    patch.hostUrl = value.hostUrl;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'useContentSidePanel')) {
    if (typeof value.useContentSidePanel !== 'boolean') throw new Error('useContentSidePanel must be a boolean');
    patch.useContentSidePanel = value.useContentSidePanel;
  }
  return patch;
}

function cleanMetadata(meta) {
  object(meta, 'meta');
  if (meta.type !== 'page' && meta.type !== 'component') {
    throw new Error('meta.type must be "page" or "component"');
  }
  if (typeof meta.url !== 'string') throw new Error('meta.url must be a string');
  if (typeof meta.title !== 'string') throw new Error('meta.title must be a string');
  if (meta.savedAt !== undefined && (!Number.isFinite(meta.savedAt) || meta.savedAt < 0)) {
    throw new Error('meta.savedAt must be a timestamp');
  }
  if (meta.fileName !== undefined && typeof meta.fileName !== 'string') {
    throw new Error('meta.fileName must be a string');
  }
  const metadata = {
    id: meta.id === undefined ? makeId() : id(meta.id),
    type: meta.type,
    url: meta.url,
    title: meta.title,
    savedAt: meta.savedAt === undefined ? Date.now() : meta.savedAt,
    fileName: meta.fileName === undefined ? 'WebCut-page.html' : meta.fileName,
  };
  return metadata;
}

async function savePage(message) {
  object(message, 'message');
  const metadata = cleanMetadata(message.meta);
  if (typeof message.html !== 'string' || message.html.trim() === '') {
    throw new Error('html must be a non-empty string');
  }
  if (message.screenshot !== undefined && typeof message.screenshot !== 'string') {
    throw new Error('screenshot must be a string');
  }
  return withLock(async () => {
    const state = await storageGet(PAGE_KEY);
    const pages = pagesFrom(state[PAGE_KEY]).filter((page) => page && page.id !== metadata.id);
    pages.unshift(metadata);
    const values = {
      [PAGE_KEY]: pages,
      [STORAGE_MAP.contentKey(metadata.id)]: message.html,
    };
    if (message.screenshot !== undefined) values[STORAGE_MAP.screenshotKey(metadata.id)] = message.screenshot;
    await storageSet(values);
    return { id: metadata.id };
  });
}

async function getPages(message) {
  object(message, 'message');
  const state = await storageGet(PAGE_KEY);
  const pages = pagesFrom(state[PAGE_KEY]).sort((left, right) => right.savedAt - left.savedAt);
  if (message.limit === undefined) return { pages };
  if (!Number.isInteger(message.limit) || message.limit < 0) throw new Error('limit must be a non-negative integer');
  return { pages: pages.slice(0, message.limit) };
}

async function getPageContent(message) {
  object(message, 'message');
  const pageId = id(message.id);
  const state = await storageGet(STORAGE_MAP.contentKey(pageId));
  return { value: state[STORAGE_MAP.contentKey(pageId)] === undefined ? null : state[STORAGE_MAP.contentKey(pageId)] };
}

async function getScreenshot(message) {
  object(message, 'message');
  const pageId = id(message.id);
  const state = await storageGet(STORAGE_MAP.screenshotKey(pageId));
  return { value: state[STORAGE_MAP.screenshotKey(pageId)] === undefined ? null : state[STORAGE_MAP.screenshotKey(pageId)] };
}

async function deletePage(message) {
  object(message, 'message');
  const pageId = id(message.id);
  return withLock(async () => {
    const state = await storageGet(PAGE_KEY);
    const pages = pagesFrom(state[PAGE_KEY]).filter((page) => page && page.id !== pageId);
    await storageSet({ [PAGE_KEY]: pages });
    await storageRemove([STORAGE_MAP.contentKey(pageId), STORAGE_MAP.screenshotKey(pageId)]);
    const folderState = await storageGet(STORAGE_MAP.folders);
    const folders = folderList(folderState[STORAGE_MAP.folders]).map((folder) => ({
      ...folder,
      itemIds: folder.itemIds.filter((linkedId) => linkedId !== pageId),
    }));
    await storageSet({ [STORAGE_MAP.folders]: folders });
    return {};
  });
}

async function clearAllData() {
  return withLock(async () => {
    const state = await storageGet(null);
    const keys = [PAGE_KEY, STORAGE_MAP.folders];
    for (const key of Object.keys(state)) {
      if (key.startsWith(STORAGE_MAP.content) || key.startsWith(STORAGE_MAP.screenshot)) {
        keys.push(key);
      }
    }
    await storageRemove(keys);
    await storageSet({ [STORAGE_MAP.folders]: [
      {
        id: DEFAULT_FOLDER_ID,
        name: 'Default',
        itemIds: [],
        createdAt: Date.now(),
        isDefault: true,
      },
    ] });
    return {};
  });
}

async function getSettings() {
  const state = await storageGet(STORAGE_MAP.settings);
  const stored = state[STORAGE_MAP.settings];
  if (stored !== undefined) validSettingsPatch(stored);
  return { settings: { ...USER_DEFAULT_SETTINGS, ...(stored || {}) } };
}

async function saveSettings(message) {
  object(message, 'message');
  const patch = validSettingsPatch(message.settings);
  return withLock(async () => {
    const state = await storageGet(STORAGE_MAP.settings);
    const stored = state[STORAGE_MAP.settings] || {};
    const settings = { ...USER_DEFAULT_SETTINGS, ...validSettingsPatch(stored), ...patch };
    await storageSet({ [STORAGE_MAP.settings]: settings });
    return { settings };
  });
}

async function getFolders() {
  return withLock(async () => {
    const state = await storageGet(STORAGE_MAP.folders);
    const folders = folderList(state[STORAGE_MAP.folders]);
    await storageSet({ [STORAGE_MAP.folders]: folders });
    return { folders };
  });
}

async function createFolder(message) {
  object(message, 'message');
  const name = folderName(message.name);
  return withLock(async () => {
    const state = await storageGet(STORAGE_MAP.folders);
    const folders = folderList(state[STORAGE_MAP.folders]);
    assertUniqueFolderName(folders, name);
    const folder = { id: makeId(), name, itemIds: [], createdAt: Date.now(), isDefault: false };
    folders.push(folder);
    await storageSet({ [STORAGE_MAP.folders]: folders });
    return { folder };
  });
}

async function renameFolder(message) {
  object(message, 'message');
  const folderId = id(message.id);
  const name = folderName(message.name);
  if (folderId === DEFAULT_FOLDER_ID) throw new Error('The default folder cannot be renamed');
  return withLock(async () => {
    const state = await storageGet(STORAGE_MAP.folders);
    const folders = folderList(state[STORAGE_MAP.folders]);
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (!folder) throw new Error('Folder not found');
    assertUniqueFolderName(folders, name, folderId);
    folder.name = name;
    await storageSet({ [STORAGE_MAP.folders]: folders });
    return { folder };
  });
}

async function deleteFolder(message) {
  object(message, 'message');
  const folderId = id(message.id);
  if (folderId === DEFAULT_FOLDER_ID) throw new Error('The default folder cannot be deleted');
  return withLock(async () => {
    const state = await storageGet(STORAGE_MAP.folders);
    const folders = folderList(state[STORAGE_MAP.folders]);
    if (!folders.some((folder) => folder.id === folderId)) throw new Error('Folder not found');
    await storageSet({ [STORAGE_MAP.folders]: folders.filter((folder) => folder.id !== folderId) });
    return {};
  });
}

async function changeFolderLink(message, add) {
  object(message, 'message');
  const pageId = id(message.pageId);
  const folderId = id(message.folderId);
  return withLock(async () => {
    const pageState = await storageGet(PAGE_KEY);
    const pages = pagesFrom(pageState[PAGE_KEY]);
    if (add && !pages.some((page) => page && page.id === pageId)) throw new Error('Page not found');
    const folderState = await storageGet(STORAGE_MAP.folders);
    const folders = folderList(folderState[STORAGE_MAP.folders]);
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (!folder) throw new Error('Folder not found');
    if (add && folder.itemIds.includes(pageId)) throw new Error('Page is already in folder');
    if (add) folder.itemIds.push(pageId);
    if (!add) folder.itemIds = folder.itemIds.filter((linkedId) => linkedId !== pageId);
    await storageSet({ [STORAGE_MAP.folders]: folders });
    return {};
  });
}

async function openTab(message) {
  object(message, 'message');
  if (typeof message.url !== 'string' || message.url.trim() === '') throw new Error('url is required');
  let parsed;
  try {
    parsed = new URL(message.url);
  } catch (error) {
    throw new Error('url must use http or https');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('url must use http or https');
  if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.create !== 'function') {
    throw new Error('chrome.tabs.create is unavailable');
  }
  const result = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const callback = (value) => {
      const lastError = chrome.runtime && chrome.runtime.lastError;
      if (lastError) finish(new Error(lastError.message || String(lastError)));
      else finish(null, value);
    };
    try {
      const returned = chrome.tabs.create({ url: message.url }, callback);
      if (returned && typeof returned.then === 'function') returned.then((value) => finish(null, value), finish);
    } catch (error) {
      finish(error);
    }
  });
  return { tabId: result && typeof result === 'object' ? result.id : result };
}

const handlers = {
  [MESSAGE_MAP.openTab]: openTab,
  [MESSAGE_MAP.fetchResource]: () => ({ ok: false, error: 'Not implemented yet' }),
  [MESSAGE_MAP.takeScreenshot]: () => ({ ok: false, error: 'Not implemented yet' }),
  [MESSAGE_MAP.savePage]: savePage,
  [MESSAGE_MAP.getPages]: getPages,
  [MESSAGE_MAP.getPageContent]: getPageContent,
  [MESSAGE_MAP.getScreenshot]: getScreenshot,
  [MESSAGE_MAP.deletePage]: deletePage,
  [MESSAGE_MAP.clearAllData]: clearAllData,
  [MESSAGE_MAP.getSettings]: getSettings,
  [MESSAGE_MAP.saveSettings]: saveSettings,
  [MESSAGE_MAP.getFolders]: getFolders,
  [MESSAGE_MAP.createFolder]: createFolder,
  [MESSAGE_MAP.renameFolder]: renameFolder,
  [MESSAGE_MAP.deleteFolder]: deleteFolder,
  [MESSAGE_MAP.addToFolder]: (message) => changeFolderLink(message, true),
  [MESSAGE_MAP.removeFromFolder]: (message) => changeFolderLink(message, false),
  [MESSAGE_MAP.toggleToolbar]: () => ({ ok: false, error: 'Not implemented yet' }),
  [MESSAGE_MAP.toggleDrawer]: () => ({ ok: false, error: 'Not implemented yet' }),
};

async function handleMessage(message) {
  try {
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      return { ok: false, error: 'Unknown message type' };
    }
    const handler = handlers[message.type];
    if (!handler) return { ok: false, error: 'Unknown message type' };
    const data = await handler(message);
    if (data && data.ok === false) return data;
    return { ok: true, ...(data || {}) };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
  });
}

if (typeof module !== 'undefined') module.exports = { handleMessage };
