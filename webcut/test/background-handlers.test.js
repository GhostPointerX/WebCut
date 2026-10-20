'use strict';

const WC = require('../shared/messages.js');

const tabsState = {
  activeTab: { id: 1, url: 'https://example.com/' },
  lastFocusedTab: null,
  byId: Object.create(null),
  sendCalls: [],
  sendBehavior: null,
  injectionCalls: [],
  injectionBehavior: null,
  capture: 'data:image/png;base64,AAAA',
};

function callbackResult(callback, value, error) {
  if (error) globalThis.chrome.runtime.lastError = { message: error };
  else delete globalThis.chrome.runtime.lastError;
  callback(value);
  delete globalThis.chrome.runtime.lastError;
}

globalThis.chrome = {
  runtime: { onMessage: { addListener() {} } },
  tabs: {
    query(query, callback) {
      const tab = tabsState.activeTab || tabsState.lastFocusedTab;
      callbackResult(callback, tab ? [tab] : []);
    },
    get(tabId, callback) {
      const tab = Object.prototype.hasOwnProperty.call(tabsState.byId, tabId)
        ? tabsState.byId[tabId]
        : tabsState.activeTab && tabsState.activeTab.id === tabId
          ? tabsState.activeTab
          : tabsState.lastFocusedTab && tabsState.lastFocusedTab.id === tabId
            ? tabsState.lastFocusedTab
          : undefined;
      callbackResult(callback, tab);
    },
    sendMessage(tabId, message, callback) {
      tabsState.sendCalls.push({ tabId, message });
      if (tabsState.sendBehavior) return tabsState.sendBehavior(tabId, message, callback);
      callbackResult(callback, { received: message });
    },
    captureVisibleTab(windowId, options, callback) {
      callbackResult(callback, tabsState.capture);
    },
  },
  scripting: {
    executeScript(details, callback) {
      tabsState.injectionCalls.push({ method: 'executeScript', details });
      if (tabsState.injectionBehavior) return tabsState.injectionBehavior('executeScript', details, callback);
      callbackResult(callback);
    },
  },
};

let fetchBehavior = async () => {
  throw new Error('fetch behavior was not configured');
};
globalThis.fetch = (...args) => fetchBehavior(...args);

globalThis.createImageBitmap = async () => ({
  width: 100,
  height: 100,
  close() {},
});
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return { drawImage() {} };
  }

  async convertToBlob() {
    return { arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
  }
};

const { handleMessage, computeCropRect, sendToTab, isRestrictedUrl } = require('../background.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function response(status, headers, bytes, ok = true) {
  const headerMap = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    status,
    ok,
    headers: { get(name) { return headerMap[name.toLowerCase()] || null; } },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function setFetch(fn) {
  fetchBehavior = fn;
}

async function send(type, fields = {}) {
  return handleMessage({ type, ...fields });
}

function resetTabs() {
  tabsState.activeTab = { id: 1, url: 'https://example.com/' };
  tabsState.lastFocusedTab = null;
  tabsState.byId = Object.create(null);
  tabsState.sendCalls = [];
  tabsState.sendBehavior = null;
  tabsState.injectionCalls = [];
  tabsState.injectionBehavior = null;
}

function configureScreenshot() {
  tabsState.capture = 'data:image/png;base64,AAAA';
  setFetch(async (url) => {
    assert(String(url).startsWith('data:'), 'screenshot source should be fetched from the capture data URL');
    return { blob: async () => ({}) };
  });
}

const cases = [];

async function test(name, fn) {
  try {
    await fn();
    cases.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    cases.push({ name, passed: false });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

(async () => {
  await test('fetchResource returns text', async () => {
    setFetch(async (url, options) => {
      assertEqual(url, 'https://example.com/text', 'normalized fetch URL');
      assertEqual(options.credentials, 'omit', 'fetch credentials');
      return response(200, { 'content-type': 'text/plain' }, Array.from(new TextEncoder().encode('Hello')));
    });
     const result = await send(WC.MSG.fetchResource, { url: 'https://example.com/text' });
     assertEqual(result.ok, true, 'text request should succeed');
     assertEqual(result.status, 200, 'text status');
    assertEqual(result.text, 'Hello', 'decoded text');
  });

  await test('fetchResource returns a data URL with prefix and base64', async () => {
    setFetch(async () => response(200, { 'content-type': 'image/png' }, [0, 1, 255]));
    const result = await send(WC.MSG.fetchResource, { url: 'https://example.com/image', as: 'dataUrl' });
    assertEqual(result.ok, true, 'data URL request should succeed');
    assertEqual(result.dataUrl, 'data:image/png;base64,AAH/', 'data URL prefix and base64');
  });

  await test('fetchResource returns an HTTP error for 404', async () => {
    setFetch(async () => response(404, {}, [], false));
    const result = await send(WC.MSG.fetchResource, { url: 'https://example.com/missing', as: 'text' });
    assertEqual(result.ok, false, '404 should fail');
    assertEqual(result.status, 404, '404 status');
    assertEqual(result.error, 'HTTP 404', '404 error');
  });

  await test('fetchResource rejects non-http URLs', async () => {
    const result = await send(WC.MSG.fetchResource, { url: 'file:///tmp/page.html', as: 'text' });
    assertEqual(result.ok, false, 'non-http URL should fail');
    assertEqual(result.error, 'url must use http or https', 'non-http error');
  });

  await test('fetchResource rejects an invalid as value', async () => {
    const result = await send(WC.MSG.fetchResource, { url: 'https://example.com/page', as: 'json' });
    assertEqual(result.ok, false, 'invalid as should fail');
    assertEqual(result.error, 'as must be "text" or "dataUrl"', 'invalid as error');
  });

  await test('fetchResource timeout is controlled without waiting 15 seconds', async () => {
    const originalAbortController = globalThis.AbortController;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.AbortController = class {
      constructor() {
        this.signal = { aborted: false };
      }

      abort() {
        this.signal.aborted = true;
      }
    };
    globalThis.setTimeout = (callback) => {
      callback();
      return 1;
    };
    globalThis.clearTimeout = () => {};
    setFetch(async (url, options) => {
      if (options.signal.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }
      throw new Error('fetch should have been aborted');
    });
    try {
      const result = await send(WC.MSG.fetchResource, { url: 'https://example.com/slow', as: 'text' });
      assertEqual(result.ok, false, 'timeout should fail');
      assertEqual(result.error, 'Request timed out', 'timeout error');
    } finally {
      globalThis.AbortController = originalAbortController;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  await test('fetchResource rejects an over-limit content length', async () => {
    setFetch(async () => response(200, { 'content-length': 15 * 1024 * 1024 + 1 }, []));
    const result = await send(WC.MSG.fetchResource, { url: 'https://example.com/large', as: 'dataUrl' });
    assertEqual(result.ok, false, 'over-limit resource should fail');
     assertEqual(result.error, 'Resource too large', 'over-limit error');
  });

  await test('computeCropRect computes a normal dpr2 crop', async () => {
    const crop = computeCropRect({ x: 10, y: 5, width: 20, height: 10 }, 2, 100, 100);
     assertEqual(JSON.stringify(crop), JSON.stringify({ sx: 20, sy: 10, sw: 40, sh: 20 }), 'normal crop');
  });

  await test('computeCropRect clamps a partly outside crop', async () => {
    const crop = computeCropRect({ x: -5, y: 40, width: 20, height: 20 }, 2, 100, 100);
     assertEqual(JSON.stringify(crop), JSON.stringify({ sx: 0, sy: 80, sw: 30, sh: 20 }), 'partly outside crop');
  });

  await test('computeCropRect returns an empty crop when fully outside', async () => {
    const crop = computeCropRect({ x: 60, y: 60, width: 10, height: 10 }, 2, 100, 100);
     assertEqual(crop, null, 'fully outside crop');
  });

  await test('computeCropRect keeps a positive tiny crop at one pixel', async () => {
    const crop = computeCropRect({ x: 1.01, y: 2.01, width: 0.01, height: 0.01 }, 2, 100, 100);
     assertEqual(JSON.stringify(crop), JSON.stringify({ sx: 2, sy: 4, sw: 1, sh: 1 }), 'tiny crop');
  });

  await test('isRestrictedUrl allows normal http and https URLs', async () => {
    assertEqual(isRestrictedUrl('http://example.com/path'), false, 'http URL should be allowed');
    assertEqual(isRestrictedUrl('https://example.com/path'), false, 'https URL should be allowed');
  });

  await test('isRestrictedUrl rejects browser-owned pages and the Chrome Web Store', async () => {
    for (const url of [
      'chrome://extensions',
      'chrome-extension://abcdefghijklmnop/options.html',
      'about:blank',
      'view-source:https://example.com/',
      'https://chrome.google.com/webstore/category/extensions',
      'https://chromewebstore.google.com/',
    ]) {
      assertEqual(isRestrictedUrl(url), true, `${url} should be restricted`);
    }
  });

  await test('isRestrictedUrl does not match restricted text inside normal paths', async () => {
    assertEqual(isRestrictedUrl('https://example.com/chrome://extensions'), false, 'chrome text in a path');
    assertEqual(isRestrictedUrl('https://example.com/about:blank'), false, 'about text in a path');
  });

  await test('isRestrictedUrl treats empty and undefined URLs as unrestricted', async () => {
    assertEqual(isRestrictedUrl(''), false, 'empty URL');
    assertEqual(isRestrictedUrl(undefined), false, 'undefined URL');
  });

  await test('takeScreenshot rejects an invalid rect', async () => {
    configureScreenshot();
    const result = await send(WC.MSG.takeScreenshot, { rect: { x: 0, y: 0, width: 10 }, dpr: 1 });
    assertEqual(result.ok, false, 'invalid rect should fail');
    assertEqual(result.error, 'rect.height must be a number', 'invalid rect error');
  });

  await test('takeScreenshot rejects an invalid dpr', async () => {
    configureScreenshot();
    const result = await send(WC.MSG.takeScreenshot, { rect: { x: 0, y: 0, width: 10, height: 10 }, dpr: 0 });
    assertEqual(result.ok, false, 'invalid dpr should fail');
     assertEqual(result.error, 'dpr must be between 0.5 and 8', 'invalid dpr error');
  });

  await test('takeScreenshot crops and returns a PNG data URL', async () => {
    configureScreenshot();
    const result = await send(WC.MSG.takeScreenshot, {
      rect: { x: 2, y: 3, width: 10, height: 12 },
      dpr: 2,
    });
    assertEqual(result.ok, true, 'screenshot should succeed');
    assertEqual(result.dataUrl, 'data:image/png;base64,AQID', 'screenshot data URL');
  });

  await test('takeScreenshot rejects an invisible element', async () => {
    configureScreenshot();
    const result = await send(WC.MSG.takeScreenshot, {
      rect: { x: 100, y: 100, width: 10, height: 10 },
      dpr: 1,
    });
    assertEqual(result.ok, false, 'invisible screenshot should fail');
    assertEqual(result.error, 'Element is not visible in the viewport', 'invisible screenshot error');
  });

  await test('sendToTab rejects restricted URLs', async () => {
    resetTabs();
    tabsState.byId[4] = { id: 4, url: 'chrome://settings/' };
     const result = await sendToTab(4, { type: 'toggle' });
     assertEqual(result.ok, false, 'restricted URL should fail');
     assertEqual(result.reason, 'restricted', 'restricted URL reason');
     assertEqual(result.error, 'WebCut cannot run on this kind of page (browser or store page).', 'restricted URL error');
    assertEqual(tabsState.sendCalls.length, 0, 'restricted URL should not send a message');
  });

  await test('sendToTab sends directly to the active tab', async () => {
    resetTabs();
    tabsState.activeTab = { id: 7, url: 'https://example.com/app' };
    const message = { type: 'toggle' };
    const result = await sendToTab(undefined, message);
     assertEqual(result.ok, true, 'direct response');
    assertEqual(tabsState.sendCalls.length, 1, 'direct send count');
    assertEqual(tabsState.sendCalls[0].tabId, 7, 'resolved active tab ID');
  });

  await test('sendToTab uses a supplied tabId instead of the active tab', async () => {
    resetTabs();
    tabsState.activeTab = { id: 1, url: 'https://example.com/active' };
    tabsState.byId[7] = { id: 7, url: 'https://example.com/supplied' };
    const result = await sendToTab(7, { type: 'toggle' });
    assertEqual(result.ok, true, 'supplied tab response');
    assertEqual(tabsState.sendCalls.length, 1, 'supplied tab send count');
    assertEqual(tabsState.sendCalls[0].tabId, 7, 'supplied tab ID');
  });

  await test('sendToTab uses the lastFocusedWindow tab when no active tab is available', async () => {
    resetTabs();
    tabsState.activeTab = null;
    tabsState.lastFocusedTab = { id: 6, url: 'https://example.com/last-focused' };
    const result = await sendToTab(undefined, { type: 'toggle' });
    assertEqual(result.ok, true, 'last focused tab response');
    assertEqual(tabsState.sendCalls[0].tabId, 6, 'last focused tab ID');
  });

  await test('handleMessage returns the no-tab reason when no tab can be resolved', async () => {
    resetTabs();
    tabsState.activeTab = null;
    tabsState.lastFocusedTab = null;
    const result = await send(WC.MSG.toggleToolbar);
    assertEqual(result.ok, false, 'missing tab should fail');
    assertEqual(result.reason, 'no-tab', 'no-tab reason code');
    assertEqual(result.error, 'No active tab was found. Click on a web page and try again.', 'no-tab error');
  });

  await test('sendToTab returns the url-unknown reason when a tab has no URL', async () => {
    resetTabs();
    tabsState.byId[11] = { id: 11 };
    const result = await sendToTab(11, { type: 'toggle' });
    assertEqual(result.ok, false, 'unknown URL should fail');
    assertEqual(result.reason, 'url-unknown', 'url-unknown reason code');
    assertEqual(result.error, 'This tab is still loading. Wait for the page to finish and try again.', 'url-unknown error');
  });

  await test('toggle handlers forward through the background service worker', async () => {
    resetTabs();
    tabsState.activeTab = { id: 10, url: 'https://example.com/toggles' };
    const toolbar = await send(WC.MSG.toggleToolbar);
    const drawer = await send(WC.MSG.toggleDrawer, { tabId: 10 });
    assertEqual(toolbar.ok, true, 'toolbar toggle response');
    assertEqual(drawer.ok, true, 'drawer toggle response');
    assertEqual(tabsState.sendCalls.length, 2, 'toggle forwarding count');
  });

  await test('sendToTab injects content and retries after a missing receiver', async () => {
    resetTabs();
    tabsState.byId[8] = { id: 8, url: 'https://example.com/retry' };
    tabsState.sendBehavior = (tabId, message, callback) => {
      if (tabsState.sendCalls.length === 1) {
        callbackResult(callback, undefined, 'Could not establish connection. Receiving end does not exist.');
      } else {
        callbackResult(callback, { retried: true });
      }
    };
    const result = await sendToTab(8, { type: 'toggle' });
     assertEqual(result.ok, true, 'retry response');
    assertEqual(tabsState.sendCalls.length, 2, 'send retry count');
     assertEqual(tabsState.injectionCalls.length, 1, 'script injection count');
     assertEqual(tabsState.injectionCalls[0].method, 'executeScript', 'script injected first');
     assertEqual(
       JSON.stringify(tabsState.injectionCalls[0].details.files),
        JSON.stringify(['shared/messages.js', 'shared/toolbar-state.js', 'shared/selection-logic.js', 'content.js']),
       'toolbar dependencies injected',
     );
  });

  await test('sendToTab reports injection failure', async () => {
    resetTabs();
    tabsState.byId[9] = { id: 9, url: 'https://example.com/failure' };
    tabsState.sendBehavior = (tabId, message, callback) => {
      callbackResult(callback, undefined, 'The message port closed before a response was received.');
    };
    tabsState.injectionBehavior = (method, details, callback) => {
      if (method === 'executeScript') callbackResult(callback, undefined, 'Cannot access contents of the page');
      else callbackResult(callback);
    };
    const result = await sendToTab(9, { type: 'toggle' });
     assertEqual(result.ok, false, 'injection failure should fail');
      assertEqual(result.reason, 'inject-failed', 'injection failure reason');
      assertEqual(result.error, 'WebCut could not start on this page: Cannot access contents of the page.', 'injection failure error');
    assertEqual(tabsState.sendCalls.length, 1, 'injection failure should not retry send');
    assertEqual(tabsState.injectionCalls.length, 1, 'injection stops after executeScript failure');
  });

  await test('handleMessage returns the no-receiver reason after injection retry fails', async () => {
    resetTabs();
    tabsState.byId[12] = { id: 12, url: 'https://example.com/no-receiver' };
    tabsState.sendBehavior = (tabId, message, callback) => {
      callbackResult(callback, undefined, 'Could not establish connection. Receiving end does not exist.');
    };
    const result = await send(WC.MSG.toggleToolbar, { tabId: 12 });
    assertEqual(result.ok, false, 'no receiver should fail');
     assertEqual(result.reason, 'no-receiver', 'no-receiver reason code');
     assertEqual(result.error, 'WebCut did not respond on this page after starting.', 'no-receiver error');
    assertEqual(tabsState.sendCalls.length, 2, 'no-receiver retry count');
  });

  await test('handleMessage returns the inject-failed reason', async () => {
    resetTabs();
    tabsState.byId[13] = { id: 13, url: 'https://example.com/inject-failed' };
    tabsState.sendBehavior = (tabId, message, callback) => {
      callbackResult(callback, undefined, 'The message port closed before a response was received.');
    };
    tabsState.injectionBehavior = (method, details, callback) => {
      callbackResult(callback, undefined, 'Cannot access contents of the page');
    };
    const result = await send(WC.MSG.toggleDrawer, { tabId: 13 });
    assertEqual(result.ok, false, 'injection failure should fail through handleMessage');
     assertEqual(result.reason, 'inject-failed', 'inject-failed reason code');
     assertEqual(result.error, 'WebCut could not start on this page: Cannot access contents of the page.', 'inject-failed error');
  });

  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  console.log(`RESULT ${passed}/${cases.length} passed`);
  if (failed > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(`FAIL test runner: ${error.message}`);
  process.exitCode = 1;
});
