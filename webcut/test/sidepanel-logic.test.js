'use strict';

const {
  filterPages,
  pickRecent,
  groupByDate,
  relativeTime,
  siteName,
  folderCounts,
  itemsInFolder,
  foldersForPage,
  validateFolderName,
} = require('../shared/sidepanel-logic.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
}

function page(id, savedAt, title = id, url = `https://example.com/${id}`) {
  return { id, type: id.startsWith('component') ? 'component' : 'page', savedAt, title, url };
}

const cases = [];

function test(name, fn) {
  try {
    fn();
    cases.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    cases.push({ name, passed: false });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

const pages = [
  page('alpha', 3000, 'Alpha Design', 'https://example.com/alpha'),
  page('beta', 2000, 'Beta Notes', 'https://other.test/beta'),
  page('component-card', 1000, 'Card Component', 'https://example.com/cards'),
];

test('filterPages matches titles', () => {
  assertDeepEqual(filterPages(pages, 'design').map((item) => item.id), ['alpha'], 'title match');
});

test('filterPages matches URLs case-insensitively', () => {
  assertDeepEqual(filterPages(pages, 'OTHER.TEST').map((item) => item.id), ['beta'], 'URL match');
});

test('filterPages returns all valid entries for an empty query', () => {
  assertDeepEqual(filterPages([...pages, null, { type: 'unknown' }, { type: 'page' }]).map((item) => item.id), ['alpha', 'beta', 'component-card'], 'empty query');
});

test('filterPages returns no results when nothing matches', () => {
  assertDeepEqual(filterPages(pages, 'missing'), [], 'no match');
});

test('pickRecent uses two newest items by default', () => {
  assertDeepEqual(pickRecent(pages).map((item) => item.id), ['alpha', 'beta'], 'default recent count');
});

test('pickRecent handles fewer items than n and preserves input', () => {
  const input = [pages[1], pages[0]];
  const before = JSON.stringify(input);
  assertDeepEqual(pickRecent(input, 5).map((item) => item.id), ['alpha', 'beta'], 'fewer items');
  assertEqual(JSON.stringify(input), before, 'input mutation');
});

test('pickRecent keeps stable ordering for equal times', () => {
  const input = [page('first', 10), page('second', 10), page('third', 20)];
  assertDeepEqual(pickRecent(input, 3).map((item) => item.id), ['third', 'first', 'second'], 'stable ties');
});

test('groupByDate orders today, yesterday, and earlier', () => {
  const now = new Date(2026, 9, 20, 12, 0, 0).getTime();
  const grouped = groupByDate([
    page('earlier', new Date(2026, 9, 17, 12).getTime()),
    page('today', new Date(2026, 9, 20, 8).getTime()),
    page('yesterday', new Date(2026, 9, 19, 8).getTime()),
  ], now);
  assertDeepEqual(grouped.map((group) => group.label), ['Today', 'Yesterday', 'Earlier'], 'group order');
  assertDeepEqual(grouped.map((group) => group.items[0].id), ['today', 'yesterday', 'earlier'], 'group items');
});

test('groupByDate omits empty groups', () => {
  const now = new Date(2026, 9, 20, 12).getTime();
  assertDeepEqual(groupByDate([page('today', now)], now).map((group) => group.label), ['Today'], 'empty groups');
});

test('relativeTime handles just now, minutes, hours, yesterday, and old dates', () => {
  const now = new Date(2026, 9, 20, 12, 0, 0).getTime();
  assertEqual(relativeTime(now - 30000, now), 'Just now', 'just now');
  assertEqual(relativeTime(now - 5 * 60000, now), '5 min ago', 'minutes');
  assertEqual(relativeTime(now - 3 * 3600000, now), '3 h ago', 'hours');
  assertEqual(relativeTime(new Date(2026, 9, 19, 12).getTime(), now), 'Yesterday', 'yesterday');
  assertEqual(relativeTime(new Date(2026, 9, 12, 12).getTime(), now), '12 Oct', 'old date');
});

test('relativeTime treats future and invalid values as just now', () => {
  const now = new Date(2026, 9, 20, 12).getTime();
  assertEqual(relativeTime(now + 60000, now), 'Just now', 'future');
  assertEqual(relativeTime('not a time', now), 'Just now', 'invalid');
});

test('siteName removes www and keeps subdomains', () => {
  assertEqual(siteName('https://www.example.com/path'), 'example.com', 'www removal');
  assertEqual(siteName('https://app.example.com/path'), 'app.example.com', 'subdomain');
  assertEqual(siteName('not a URL'), '', 'invalid URL');
});

test('folderCounts ignores missing page ids and counts empty folders', () => {
  const folders = [
    { id: 'default', name: 'Default', itemIds: ['alpha', 'missing', 'alpha'] },
    { id: 'empty', name: 'Empty', itemIds: [] },
  ];
  assertDeepEqual(folderCounts(folders, pages), { default: 1, empty: 0 }, 'folder counts');
});

test('itemsInFolder follows page order and ignores missing ids', () => {
  const folder = { id: 'folder', itemIds: ['component-card', 'missing', 'alpha'] };
  assertDeepEqual(itemsInFolder(folder, pages).map((item) => item.id), ['alpha', 'component-card'], 'folder items');
});

test('foldersForPage returns containing folder ids', () => {
  const folders = [
    { id: 'one', itemIds: ['alpha'] },
    { id: 'two', itemIds: ['beta', 'alpha'] },
    { id: 'empty', itemIds: [] },
  ];
  assertDeepEqual(foldersForPage(folders, 'alpha'), ['one', 'two'], 'containing folders');
});

test('validateFolderName rejects empty and overlong names', () => {
  assertEqual(validateFolderName('   ', [], undefined).ok, false, 'empty folder name');
  assertEqual(validateFolderName('x'.repeat(41), [], undefined).ok, false, 'long folder name');
});

test('validateFolderName rejects duplicate names regardless of case', () => {
  const result = validateFolderName('design', [{ id: 'one', name: 'Design', itemIds: [] }], undefined);
  assertEqual(result.ok, false, 'duplicate folder name');
});

test('validateFolderName allows renaming a folder to its own name', () => {
  const result = validateFolderName(' Design ', [{ id: 'one', name: 'Design', itemIds: [] }], 'one');
  assertDeepEqual(result, { ok: true, name: 'Design' }, 'same folder rename');
});

test('validateFolderName accepts a valid unique name', () => {
  assertDeepEqual(validateFolderName('  Archive  ', [], undefined), { ok: true, name: 'Archive' }, 'valid folder name');
});

const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
console.log(`RESULT ${passed}/${cases.length} passed`);
if (failed > 0) process.exitCode = 1;
