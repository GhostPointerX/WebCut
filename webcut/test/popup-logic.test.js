'use strict';

const { countByType, normalizeHostUrl, friendlyError } = require('../shared/popup-logic.js');

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

test('countByType counts mixed valid entries', () => {
  assertDeepEqual(countByType([
    { type: 'page' },
    { type: 'component' },
    { type: 'page' },
    { type: 'unknown' },
    null,
  ]), { pages: 2, components: 1, total: 3 }, 'mixed counts');
});

test('countByType handles empty and null input', () => {
  assertDeepEqual(countByType([]), { pages: 0, components: 0, total: 0 }, 'empty counts');
  assertDeepEqual(countByType(null), { pages: 0, components: 0, total: 0 }, 'null counts');
});

test('countByType ignores invalid entries', () => {
  assertDeepEqual(countByType([undefined, 1, 'page', [], {}, { type: 'PAGE' }]), {
    pages: 0,
    components: 0,
    total: 0,
  }, 'invalid entries');
});

test('normalizeHostUrl accepts an empty value', () => {
  assertEqual(normalizeHostUrl('   '), '', 'empty host');
});

test('normalizeHostUrl accepts valid https URLs', () => {
  assertEqual(normalizeHostUrl('https://Example.com/api?mode=1#top'), 'https://example.com/api?mode=1#top', 'https URL');
});

test('normalizeHostUrl rejects http URLs', () => {
  assertEqual(normalizeHostUrl('http://example.com'), null, 'http rejection');
});

test('normalizeHostUrl rejects garbage', () => {
  assertEqual(normalizeHostUrl('not a URL'), null, 'garbage rejection');
});

test('normalizeHostUrl trims spaces', () => {
  assertEqual(normalizeHostUrl('  https://example.com/path  '), 'https://example.com/path', 'trimmed URL');
});

test('normalizeHostUrl removes only a root trailing slash', () => {
  assertEqual(normalizeHostUrl('https://example.com/'), 'https://example.com', 'root slash');
  assertEqual(normalizeHostUrl('https://example.com/path/'), 'https://example.com/path/', 'path slash');
});

test('friendlyError returns explicit error text', () => {
  assertEqual(friendlyError({ ok: false, error: 'No active tab.' }), 'No active tab.', 'explicit error');
});

['restricted', 'no-tab', 'url-unknown', 'inject-failed', 'no-receiver'].forEach((reason) => {
  test(`friendlyError maps ${reason}`, () => {
    const result = friendlyError({ ok: false, reason });
    assert(result && result !== 'Something went wrong', `${reason} should have friendly text`);
  });
});

test('friendlyError falls back for missing input', () => {
  assertEqual(friendlyError(), 'Something went wrong', 'missing response');
  assertEqual(friendlyError({ ok: false, reason: 'unknown' }), 'Something went wrong', 'unknown reason');
});

const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
console.log(`RESULT ${passed}/${cases.length} passed`);
if (failed > 0) process.exitCode = 1;
