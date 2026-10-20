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

const MAX_RESOURCE_BYTES = 15 * 1024 * 1024;
const RESOURCE_TIMEOUT_MS = 15 * 1000;
const RESTRICTED_SCHEMES = new Set([
  'about:',
  'blob:',
  'chrome:',
  'chrome-extension:',
  'data:',
  'devtools:',
  'edge:',
  'file:',
  'moz-extension:',
  'opera:',
  'view-source:',
  'vivaldi:',
]);

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return null;
}

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === 'function') return btoa(binary);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  throw new Error('Base64 encoding is unavailable');
}

function validResourceUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('url is required');
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error('url must use http or https');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('url must use http or https');
  }
  return parsed.href;
}

async function fetchResource(message) {
  object(message, 'message');
  const url = validResourceUrl(message.url);
  const as = message.as === undefined ? 'text' : message.as;
  if (as !== 'text' && as !== 'dataUrl') {
    throw new Error('as must be "text" or "dataUrl"');
  }
  if (typeof fetch !== 'function') throw new Error('fetch is unavailable');
  if (typeof AbortController !== 'function') throw new Error('AbortController is unavailable');

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeoutError = new Error('Request timed out');
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, RESOURCE_TIMEOUT_MS);
  });
  let response;
  try {
    response = await Promise.race([
      fetch(url, {
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    clearTimeout(timer);
    if (timedOut || error === timeoutError || (error && error.name === 'AbortError')) {
      throw new Error('Request timed out');
    }
    throw new Error(`Network error: ${error && error.message ? error.message : 'request failed'}`);
  }

  const status = Number(response && response.status);
  if (!response || status < 200 || status >= 300 || response.ok === false) {
    clearTimeout(timer);
    return { ok: false, status, error: `HTTP ${status}` };
  }
  const length = Number(headerValue(response.headers, 'content-length'));
  if (Number.isFinite(length) && length > MAX_RESOURCE_BYTES) {
    clearTimeout(timer);
    return { ok: false, error: 'Resource too large' };
  }

  let body;
  try {
    body = await Promise.race([response.arrayBuffer(), timeoutPromise]);
  } catch (error) {
    if (timedOut || error === timeoutError || (error && error.name === 'AbortError')) {
      throw new Error('Request timed out');
    }
    throw new Error(`Network error: ${error && error.message ? error.message : 'response failed'}`);
  } finally {
    clearTimeout(timer);
  }
  if (body.byteLength > MAX_RESOURCE_BYTES) {
    return { ok: false, error: 'Resource too large' };
  }
  if (as === 'text') {
    return { status, text: new TextDecoder().decode(body) };
  }
  const contentType = headerValue(response.headers, 'content-type') || 'application/octet-stream';
  return { status, dataUrl: `data:${contentType};base64,${bytesToBase64(body)}` };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function computeCropRect(rect, dpr, bitmapWidth, bitmapHeight) {
  object(rect, 'rect');
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!finiteNumber(rect[key])) throw new Error(`rect.${key} must be a number`);
  }
  if (rect.width <= 0 || rect.height <= 0) throw new Error('rect width and height must be greater than zero');
  if (!finiteNumber(dpr) || dpr < 0.5 || dpr > 8) throw new Error('dpr must be between 0.5 and 8');
  if (!finiteNumber(bitmapWidth) || !finiteNumber(bitmapHeight) || bitmapWidth <= 0 || bitmapHeight <= 0) {
    throw new Error('bitmap dimensions must be positive numbers');
  }

  const left = Math.round(rect.x * dpr);
  const top = Math.round(rect.y * dpr);
  const right = Math.round((rect.x + rect.width) * dpr);
  const bottom = Math.round((rect.y + rect.height) * dpr);
  const x = Math.min(bitmapWidth, Math.max(0, left));
  const y = Math.min(bitmapHeight, Math.max(0, top));
  const clampedRight = Math.min(bitmapWidth, Math.max(0, right));
  const clampedBottom = Math.min(bitmapHeight, Math.max(0, bottom));
  let width = clampedRight - x;
  let height = clampedBottom - y;
  if (width === 0 && rect.x < bitmapWidth / dpr && rect.x + rect.width > 0) width = 1;
  if (height === 0 && rect.y < bitmapHeight / dpr && rect.y + rect.height > 0) height = 1;
  width = Math.min(width, bitmapWidth - x);
  height = Math.min(height, bitmapHeight - y);
  if (width <= 0 || height <= 0) return null;
  return { sx: x, sy: y, sw: width, sh: height };
}

function chromeCall(context, name, args) {
  if (!context || typeof context[name] !== 'function') {
    return Promise.reject(new Error(`chrome.${name} is unavailable`));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const callback = (value) => {
      const lastError = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.lastError : null;
      if (lastError) finish(new Error(lastError.message || String(lastError)));
      else finish(null, value);
    };
    let result;
    try {
      result = context[name](...args, callback);
    } catch (error) {
      finish(error);
      return;
    }
    if (result && typeof result.then === 'function') result.then((value) => finish(null, value), (error) => finish(error));
  });
}

async function takeScreenshot(message, sender) {
  object(message, 'message');
  if (!message.rect || typeof message.rect !== 'object' || Array.isArray(message.rect)) {
    throw new Error('rect must be an object');
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!finiteNumber(message.rect[key])) throw new Error(`rect.${key} must be a number`);
  }
  if (message.rect.width <= 0 || message.rect.height <= 0) {
    throw new Error('rect width and height must be greater than zero');
  }
  if (!finiteNumber(message.dpr) || message.dpr < 0.5 || message.dpr > 8) {
    throw new Error('dpr must be between 0.5 and 8');
  }
  const tabs = typeof chrome !== 'undefined' ? chrome.tabs : null;
  if (!tabs || typeof tabs.captureVisibleTab !== 'function') throw new Error('chrome.tabs.captureVisibleTab is unavailable');
  const senderWindowId = sender && sender.tab && sender.tab.windowId;
  const currentWindow = typeof chrome !== 'undefined' && chrome.windows
    ? chrome.windows.WINDOW_ID_CURRENT
    : undefined;
  const windowId = Number.isInteger(senderWindowId) ? senderWindowId : currentWindow;
  const captured = await chromeCall(tabs, 'captureVisibleTab', [windowId, { format: 'png' }]);
  if (typeof captured !== 'string' || !captured.startsWith('data:')) throw new Error('Screenshot capture returned no data');
  if (typeof fetch !== 'function') throw new Error('fetch is unavailable');
  const sourceResponse = await fetch(captured);
  if (!sourceResponse || typeof sourceResponse.blob !== 'function') throw new Error('Screenshot data could not be decoded');
  const sourceBlob = await sourceResponse.blob();
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap is unavailable');
  if (typeof OffscreenCanvas !== 'function') throw new Error('OffscreenCanvas is unavailable');
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const crop = computeCropRect(message.rect, message.dpr, bitmap.width, bitmap.height);
    if (!crop) throw new Error('Element is not visible in the viewport');
    const canvas = new OffscreenCanvas(crop.sw, crop.sh);
    const context = canvas.getContext('2d');
    if (!context || typeof context.drawImage !== 'function') throw new Error('2D canvas is unavailable');
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
    if (typeof canvas.convertToBlob !== 'function') throw new Error('PNG encoding is unavailable');
    const output = await canvas.convertToBlob({ type: 'image/png' });
    if (!output || typeof output.arrayBuffer !== 'function') throw new Error('PNG encoding returned no data');
    return { dataUrl: `data:image/png;base64,${bytesToBase64(await output.arrayBuffer())}` };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

function restrictedUrl(url) {
  return isRestrictedUrl(url);
}

function isRestrictedUrl(urlString) {
  if (typeof urlString !== 'string' || urlString.trim() === '') return false;

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (error) {
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(urlString.trim());
    return Boolean(scheme && scheme[1].toLowerCase() !== 'http' && scheme[1].toLowerCase() !== 'https');
  }

  if (RESTRICTED_SCHEMES.has(parsed.protocol)) return true;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  const host = parsed.hostname.toLowerCase();
  return (host === 'chrome.google.com' && parsed.pathname.toLowerCase().startsWith('/webstore'))
    || host === 'chromewebstore.google.com';
}

async function resolveTabId(tabId) {
  if (tabId !== undefined && tabId !== null) {
    if (!Number.isInteger(tabId)) throw new Error('No active tab was found. Click on a web page and try again.');
    return tabId;
  }
  let tabs;
  try {
    tabs = await chromeCall(chrome.tabs, 'query', [{ active: true, lastFocusedWindow: true }]);
  } catch (error) {
    throw new Error('No active tab was found. Click on a web page and try again.');
  }
  const tab = Array.isArray(tabs) ? tabs[0] : null;
  if (!tab || !Number.isInteger(tab.id)) throw new Error('No active tab was found. Click on a web page and try again.');
  return tab.id;
}

function missingReceiver(error) {
  const text = error && error.message ? error.message : String(error);
  return /receiving end does not exist|could not establish connection|message port closed before a response was received/i.test(text);
}

async function injectContent(tabId) {
  if (!chrome.scripting) throw new Error('chrome.scripting is unavailable');
  await chromeCall(chrome.scripting, 'executeScript', [{
    target: { tabId },
    files: ['shared/messages.js', 'shared/toolbar-state.js', 'shared/selection-logic.js', 'content.js'],
  }]);
}

async function sendToTab(tabId, message) {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return { ok: false, reason: 'no-tab', error: 'No active tab was found. Click on a web page and try again.' };
    }
    const resolvedTabId = await resolveTabId(tabId);
    let tabs;
    try {
      tabs = await chromeCall(chrome.tabs, 'get', [resolvedTabId]);
    } catch (error) {
      return { ok: false, reason: 'no-tab', error: 'No active tab was found. Click on a web page and try again.' };
    }
    if (!tabs) return { ok: false, reason: 'no-tab', error: 'No active tab was found. Click on a web page and try again.' };
    if (typeof tabs.url !== 'string' || tabs.url.trim() === '') {
      return { ok: false, reason: 'url-unknown', error: 'This tab is still loading. Wait for the page to finish and try again.' };
    }
    if (restrictedUrl(tabs.url)) {
      return { ok: false, reason: 'restricted', error: 'WebCut cannot run on this kind of page (browser or store page).' };
    }
    let response;
    try {
      response = await chromeCall(chrome.tabs, 'sendMessage', [resolvedTabId, message]);
    } catch (error) {
      if (!missingReceiver(error)) {
        return { ok: false, reason: 'inject-failed', error: `WebCut could not start on this page: ${error.message || 'message delivery failed'}.` };
      }
      try {
        await injectContent(resolvedTabId);
      } catch (injectionError) {
        return { ok: false, reason: 'inject-failed', error: `WebCut could not start on this page: ${injectionError.message || 'injection failed'}.` };
      }
      try {
        response = await chromeCall(chrome.tabs, 'sendMessage', [resolvedTabId, message]);
      } catch (retryError) {
        if (missingReceiver(retryError)) {
          return { ok: false, reason: 'no-receiver', error: 'WebCut did not respond on this page after starting.' };
        }
        return { ok: false, reason: 'inject-failed', error: `WebCut could not start on this page: ${retryError.message || 'message delivery failed'}.` };
      }
    }
    if (response && typeof response === 'object') return { ok: true, ...response };
    return { ok: true };
  } catch (error) {
    if (error && error.message === 'No active tab was found. Click on a web page and try again.') {
      return { ok: false, reason: 'no-tab', error: error.message };
    }
    return { ok: false, reason: 'inject-failed', error: `WebCut could not start on this page: ${error && error.message ? error.message : String(error)}.` };
  }
}

const handlers = {
  [MESSAGE_MAP.openTab]: openTab,
  [MESSAGE_MAP.fetchResource]: fetchResource,
  [MESSAGE_MAP.takeScreenshot]: takeScreenshot,
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
  [MESSAGE_MAP.toggleToolbar]: (message) => sendToTab(message.tabId, message),
  [MESSAGE_MAP.toggleDrawer]: (message) => sendToTab(message.tabId, message),
};

async function handleMessage(message, sender) {
  try {
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      return { ok: false, error: 'Unknown message type' };
    }
    const handler = handlers[message.type];
    if (!handler) return { ok: false, error: 'Unknown message type' };
    const data = await handler(message, sender);
    if (data && data.ok === false) return data;
    return { ok: true, ...(data || {}) };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse);
    return true;
  });
}

if (typeof module !== 'undefined') module.exports = { handleMessage, computeCropRect, sendToTab, isRestrictedUrl };
