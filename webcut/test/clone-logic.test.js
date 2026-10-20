'use strict';

const {
  absolutizeCssUrls,
  computeScrollSteps,
  isEventHandlerAttr,
} = require('../shared/clone-logic.js');

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
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

test('absolutizeCssUrls resolves quoted and unquoted relative url() values', () => {
  assertEqual(
    absolutizeCssUrls('a{background:url("../img/a.png")}b{background:url(icons/b.svg)}', 'https://example.com/css/main.css'),
    'a{background:url("https://example.com/img/a.png")}b{background:url(https://example.com/css/icons/b.svg)}',
    'relative CSS URLs',
  );
});

test('absolutizeCssUrls preserves url() whitespace and quote style', () => {
  assertEqual(
    absolutizeCssUrls('a{background:url(  "img/a.png"  )}b{background:url(  img/b.svg  )}', 'https://example.com/css/main.css'),
    'a{background:url(  "https://example.com/css/img/a.png"  )}b{background:url(  https://example.com/css/img/b.svg  )}',
    'CSS URL formatting',
  );
});

test('absolutizeCssUrls leaves data, blob, HTTP(S), and fragment URLs unchanged', () => {
  const css = [
    'a{background:url(data:image/png;base64,abc)}',
    'b{background:url(blob:https://example.com/id)}',
    'c{background:url(https://cdn.example.com/a.png)}',
    'd{background:url(http://cdn.example.com/b.png)}',
    'e{background:url(//cdn.example.com/c.png)}',
    'f{background:url(#local-gradient)}',
  ].join('');
  const expected = css.replace('url(//cdn.example.com/c.png)', 'url(https://cdn.example.com/c.png)');
  assertEqual(absolutizeCssUrls(css, 'https://example.com/css/main.css'), expected, 'already absolute CSS URLs');
});

test('absolutizeCssUrls resolves quoted @import targets', () => {
  assertEqual(
    absolutizeCssUrls('@import "theme/base.css" screen; @IMPORT \'print.css\';', 'https://example.com/css/main.css'),
    '@import "https://example.com/css/theme/base.css" screen; @IMPORT \'https://example.com/css/print.css\';',
    'quoted imports',
  );
});

test('absolutizeCssUrls returns invalid input unchanged without throwing', () => {
  assertEqual(absolutizeCssUrls(null, 'https://example.com/'), null, 'null CSS');
  assertEqual(absolutizeCssUrls(undefined, 'https://example.com/'), undefined, 'undefined CSS');
  const css = 'a{background:url(images/a.png)}';
  assertEqual(absolutizeCssUrls(css, 'not a URL'), css, 'invalid base URL');
  assertEqual(absolutizeCssUrls('a{background:url(}'), 'a{background:url(}', 'malformed CSS');
});

test('computeScrollSteps returns one step when the viewport covers the document', () => {
  assertEqual(computeScrollSteps(800, 800), [0], 'equal heights');
  assertEqual(computeScrollSteps(600, 800), [0], 'short document');
});

test('computeScrollSteps uses ratio-based overlapping scroll positions', () => {
  assertEqual(computeScrollSteps(2000, 500), [0, 350, 700, 1050, 1400, 1500], 'default ratio');
  assertEqual(computeScrollSteps(2000, 500, 0.5), [0, 250, 500, 750, 1000, 1250, 1500], 'custom ratio');
});

test('computeScrollSteps clamps the result to maxSteps and handles invalid options', () => {
  assertEqual(computeScrollSteps(100000, 500, 0.7, 3), [0, 350, 99500], 'maximum step limit');
  assertEqual(computeScrollSteps(2000, 500, 0, 60), [0], 'invalid ratio');
  assertEqual(computeScrollSteps(2000, 500, 0.7, 0), [0], 'invalid max steps');
  assertEqual(computeScrollSteps(NaN, 500), [0], 'invalid height');
});

test('isEventHandlerAttr accepts alphabetic on* attribute names case-insensitively', () => {
  assertEqual(isEventHandlerAttr('onclick'), true, 'onclick');
  assertEqual(isEventHandlerAttr('onerror'), true, 'onerror');
  assertEqual(isEventHandlerAttr('ONCLICK'), true, 'uppercase onclick');
});

test('isEventHandlerAttr rejects exact on and nonalphabetic names', () => {
  for (const value of ['on', 'class', 'content', 'once-x', 'data-on-x', 'on1', 'on-click', '', null, undefined]) {
    assertEqual(isEventHandlerAttr(value), false, `rejected ${String(value)}`);
  }
});

const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
console.log(`RESULT ${passed}/${cases.length} passed`);
if (failed > 0) process.exitCode = 1;
