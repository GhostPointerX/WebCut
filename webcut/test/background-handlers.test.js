'use strict';

const WC = require('../shared/messages.js');

const tabsState = {
  activeTab: { id: 1, url: 'https://example.com/' },
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
      callbackResult(callback, [tabsState.activeTab]);
    },
    get(tabId, callback) {
      callbackResult(callback, tabsState.byId[tabId] || tabsState.activeTab);
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

const { handleMessage, computeCropRect, sendToTab } = require('../background.js');

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
     assertEqual(result.error, 'WebCut cannot run on this page', 'restricted URL error');
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
       JSON.stringify(['shared/messages.js', 'shared/toolbar-state.js', 'content.js']),
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
     assertEqual(result.error, 'Cannot access contents of the page', 'injection failure error');
    assertEqual(tabsState.sendCalls.length, 1, 'injection failure should not retry send');
    assertEqual(tabsState.injectionCalls.length, 1, 'injection stops after executeScript failure');
  });

  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  console.log(`RESULT ${passed}/${cases.length} passed`);
  if (failed > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(`FAIL test runner: ${error.message}`);
  process.exitCode = 1;
});
