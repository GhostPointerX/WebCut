'use strict';

const store = Object.create(null);

function delay() {
  return new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 3)));
}

function selectedKeys(keys) {
  if (keys === null || keys === undefined) return Object.keys(store);
  if (typeof keys === 'string') return [keys];
  if (Array.isArray(keys)) return keys;
  return Object.keys(keys);
}

const localStorage = {
  async get(keys) {
    await delay();
    const result = {};
    for (const key of selectedKeys(keys)) {
      if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
    }
    return result;
  },
  async set(values) {
    await delay();
    Object.assign(store, values);
  },
  async remove(keys) {
    await delay();
    for (const key of selectedKeys(keys)) delete store[key];
  },
};

globalThis.chrome = {
  storage: { local: localStorage },
  runtime: { onMessage: { addListener() {} } },
};

const WC = require('../shared/messages.js');
const { handleMessage } = require('../background.js');

function clearMockStorage() {
  for (const key of Object.keys(store)) delete store[key];
}

function pageMeta(id, savedAt) {
  return {
    id,
    type: 'page',
    url: `https://example.com/${id}`,
    title: id,
    savedAt,
    fileName: `${id}.html`,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

async function send(type, fields = {}) {
  return handleMessage({ type, ...fields });
}

async function expectFailure(promise, message) {
  const result = await promise;
  assertEqual(result.ok, false, message);
  return result;
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
  await test('25 concurrent saves keep every page', async () => {
    clearMockStorage();
    const results = await Promise.all(Array.from({ length: 25 }, (_, index) => send(WC.MSG.savePage, {
      meta: pageMeta(`page-${index}`, index + 1),
      html: `<main>${index}</main>`,
    })));
    assert(results.every((result) => result.ok), 'all saves should succeed');
    const pages = await send(WC.MSG.getPages);
    assertEqual(pages.pages.length, 25, 'saved page count');
  });

  await test('getPages sorts newest first and honors limit', async () => {
    clearMockStorage();
    await send(WC.MSG.savePage, { meta: pageMeta('old', 10), html: '<p>old</p>' });
    await send(WC.MSG.savePage, { meta: pageMeta('new', 30), html: '<p>new</p>' });
    await send(WC.MSG.savePage, { meta: pageMeta('middle', 20), html: '<p>middle</p>' });
    const result = await send(WC.MSG.getPages, { limit: 2 });
    assertEqual(result.pages.length, 2, 'limited page count');
    assertEqual(result.pages[0].id, 'new', 'newest page first');
    assertEqual(result.pages[1].id, 'middle', 'second newest page second');
  });

  await test('deletePage removes stored data and folder links', async () => {
    clearMockStorage();
    await send(WC.MSG.savePage, {
      meta: pageMeta('delete-me', 1),
      html: '<article>saved</article>',
      screenshot: 'data:image/png;base64,abc',
    });
    const folderResult = await send(WC.MSG.createFolder, { name: 'Archive' });
    await send(WC.MSG.addToFolder, { folderId: folderResult.folder.id, pageId: 'delete-me' });
    const deleted = await send(WC.MSG.deletePage, { id: 'delete-me' });
    assertEqual(deleted.ok, true, 'delete should succeed');
    assertEqual((await send(WC.MSG.getPageContent, { id: 'delete-me' })).value, null, 'content removed');
    assertEqual((await send(WC.MSG.getScreenshot, { id: 'delete-me' })).value, null, 'screenshot removed');
    const folders = await send(WC.MSG.getFolders);
    assert(folders.folders.every((folder) => !folder.itemIds.includes('delete-me')), 'folder link removed');
  });

  await test('default folder is created and protected', async () => {
    clearMockStorage();
    const result = await send(WC.MSG.getFolders);
    const defaultFolder = result.folders.find((folder) => folder.isDefault);
    assert(defaultFolder, 'default folder should exist');
    assertEqual(defaultFolder.name, 'Default', 'default folder name');
    assertEqual((await send(WC.MSG.deleteFolder, { id: defaultFolder.id })).ok, false, 'default delete rejected');
    assertEqual((await send(WC.MSG.renameFolder, { id: defaultFolder.id, name: 'Renamed' })).ok, false, 'default rename rejected');
  });

  await test('folder validation, links, and deletion preserve pages', async () => {
    clearMockStorage();
    await send(WC.MSG.savePage, { meta: pageMeta('kept', 1), html: '<p>kept</p>' });
    const created = await send(WC.MSG.createFolder, { name: 'Design' });
    assertEqual((await send(WC.MSG.createFolder, { name: ' design ' })).ok, false, 'duplicate folder rejected');
    assertEqual((await send(WC.MSG.createFolder, { name: '   ' })).ok, false, 'empty folder rejected');
    assertEqual((await send(WC.MSG.addToFolder, { folderId: created.folder.id, pageId: 'kept' })).ok, true, 'page linked');
    assertEqual((await send(WC.MSG.addToFolder, { folderId: created.folder.id, pageId: 'kept' })).ok, false, 'duplicate link rejected');
    assertEqual((await send(WC.MSG.addToFolder, { folderId: created.folder.id, pageId: 'missing' })).ok, false, 'unknown page rejected');
    assertEqual((await send(WC.MSG.deleteFolder, { id: created.folder.id })).ok, true, 'folder deleted');
    const pages = await send(WC.MSG.getPages);
    assertEqual(pages.pages.length, 1, 'page preserved after folder deletion');
  });

  await test('invalid input and unknown messages return errors', async () => {
    clearMockStorage();
    const invalid = await send(WC.MSG.savePage, {
      meta: { type: 'invalid', url: 'https://example.com', title: 'Bad', fileName: 'bad.html' },
      html: '<p>bad</p>',
    });
    assertEqual(invalid.ok, false, 'invalid save rejected');
    const unknown = await send('notARealMessage');
    assertEqual(unknown.ok, false, 'unknown message rejected');
    assertEqual(unknown.error, 'Unknown message type', 'unknown message error');
  });

  await test('clearAllData resets pages and folders but keeps settings', async () => {
    clearMockStorage();
    await send(WC.MSG.saveSettings, { settings: { hostUrl: 'https://example.com', useContentSidePanel: true } });
    await send(WC.MSG.savePage, {
      meta: pageMeta('clear-me', 1),
      html: '<p>clear</p>',
      screenshot: 'data:image/png;base64,clear',
    });
    await send(WC.MSG.createFolder, { name: 'Temporary' });
    assertEqual((await send(WC.MSG.clearAllData)).ok, true, 'clear should succeed');
    assertEqual((await send(WC.MSG.getPages)).pages.length, 0, 'pages cleared');
    const folders = await send(WC.MSG.getFolders);
    assertEqual(folders.folders.length, 1, 'only default folder remains');
    assertEqual(folders.folders[0].name, 'Default', 'default folder restored');
    const settings = await send(WC.MSG.getSettings);
    assertEqual(settings.settings.hostUrl, 'https://example.com', 'host setting kept');
    assertEqual(settings.settings.useContentSidePanel, true, 'side panel setting kept');
  });

  await test('saveSettings rejects non-https host URLs', async () => {
    clearMockStorage();
    const result = await expectFailure(
      send(WC.MSG.saveSettings, { settings: { hostUrl: 'http://example.com' } }),
      'non-https host rejected',
    );
    assert(result.error.includes('https'), 'error explains https requirement');
  });

  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  console.log(`RESULT ${passed}/${cases.length} passed`);
  if (failed > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(`FAIL test runner: ${error.message}`);
  process.exitCode = 1;
});
