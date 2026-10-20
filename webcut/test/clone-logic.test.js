'use strict';

const {
  absolutizeCssUrls,
  attrsToString,
  buildComponentDocument,
  buildFileName,
  computeScrollSteps,
  escapeHtml,
  escapeStyleText,
  findCssUrls,
  formatBytes,
  isEventHandlerAttr,
  previewTitle,
  replaceCssUrls,
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

test('buildFileName uses a normalized HTTP(S) hostname and a page fallback', () => {
  assertEqual(buildFileName('https://www.github.com/x'), 'WebCut-github.com.html', 'hostname filename');
  assertEqual(buildFileName('https://Sub.Example.COM:8080/some/page'), 'WebCut-sub.example.com.html', 'subdomain and port');
  assertEqual(buildFileName('https://a_b.example.com/x'), 'WebCut-a-b.example.com.html', 'hostname sanitization');
  assertEqual(buildFileName('not a URL'), 'WebCut-page.html', 'invalid URL fallback');
  assertEqual(buildFileName(''), 'WebCut-page.html', 'empty URL fallback');
  assertEqual(buildFileName('file:' + '//' + '/tmp/page.html'), 'WebCut-page.html', 'file URL fallback');
  assertEqual(buildFileName('about:blank'), 'WebCut-page.html', 'about URL fallback');
  [null, undefined, {}, 'https://[bad-host]'].forEach((value) => {
    assertEqual(buildFileName(value), 'WebCut-page.html', 'invalid input never throws');
  });
});

test('escapeHtml escapes markup characters and tolerates nullish values', () => {
  assertEqual(escapeHtml('<a title="x">&\'y</a>'), '&lt;a title=&quot;x&quot;&gt;&amp;&#39;y&lt;/a&gt;', 'HTML escaping');
  assertEqual(escapeHtml(null), '', 'null escaping');
});

test('escapeStyleText prevents captured CSS from closing its style element', () => {
  assertEqual(escapeStyleText('a{content:"</style><script>bad</script>"}'), 'a{content:"<\\/style><script>bad</script>"}', 'style escaping');
});

test('attrsToString emits escaped safe attributes and excludes unsafe names', () => {
  assertEqual(
    attrsToString({ class: 'card', 'data-kind': 'x&y', onclick: 'bad()', 'bad name': 'bad' }),
    ' class="card" data-kind="x&amp;y"',
    'attribute serialization',
  );
});

test('findCssUrls returns unique absolute HTTP(S) URLs only', () => {
  assertEqual(
    findCssUrls('a{background:url("https://cdn.example/a.png")}b{src:url(https://cdn.example/a.png)}c{src:url(/relative.png)}d{src:url(data:image/png,x)}@import "http://example.com/base.css";'),
    ['https://cdn.example/a.png'],
    'CSS URL discovery',
  );
});

test('replaceCssUrls changes mapped absolute URLs and preserves unmapped CSS', () => {
  const css = 'a{background:url(  "https://cdn.example/a.png"  )}b{src:url(https://cdn.example/b.png)}c{src:url(/relative.png)}';
  assertEqual(
    replaceCssUrls(css, { 'https://cdn.example/a.png': 'assets/a.png' }),
    'a{background:url(  "assets/a.png"  )}b{src:url(https://cdn.example/b.png)}c{src:url(/relative.png)}',
    'CSS URL replacement',
  );
});

test('buildComponentDocument includes document metadata, base, styles, and attributes', () => {
  const document = buildComponentDocument({
    title: 'A <component>',
    url: 'https://example.com/path?a=1&b=2',
    htmlAttrs: { lang: 'en' },
    bodyAttrs: { class: 'card' },
    css: '.card{color:red}',
    bodyHtml: '<main class="card">Hello</main>',
  });
  assertEqual(document.indexOf('<!DOCTYPE html>') === 0, true, 'doctype');
  assertEqual(document.indexOf('<html lang="en">') !== -1, true, 'html attributes');
  assertEqual(document.indexOf('<meta charset="utf-8">') !== -1, true, 'charset');
  assertEqual(document.indexOf('<meta name="viewport" content="width=device-width, initial-scale=1">') !== -1, true, 'viewport');
  assertEqual(document.indexOf('<title>A &lt;component&gt;</title>') !== -1, true, 'title');
  assertEqual(document.indexOf('<base href="https://example.com/path?a=1&amp;b=2">') !== -1, true, 'base');
  assertEqual(document.indexOf('<style data-webcut-reset="true">') !== -1, true, 'reset style');
  assertEqual(document.indexOf('<style data-webcut-capture="true">.card{color:red}</style>') !== -1, true, 'style');
  assertEqual(document.indexOf('<body class="card"><main class="card">Hello</main>') !== -1, true, 'body');
});

test('formatBytes uses readable binary units and handles invalid values', () => {
  assertEqual(formatBytes(0), '0 B', 'zero bytes');
  assertEqual(formatBytes(1023), '1023 B', 'bytes');
  assertEqual(formatBytes(1536), '1.5 KB', 'kilobytes');
  assertEqual(formatBytes(1048576), '1.0 MB', 'megabytes');
  assertEqual(formatBytes(512), '512 B', 'small bytes');
  assertEqual(formatBytes(-1), '0 B', 'negative bytes');
  assertEqual(formatBytes(NaN), '0 B', 'invalid bytes');
});

test('previewTitle labels captures and truncates long titles', () => {
  assertEqual(previewTitle('  Home page  ', 'page'), 'Home page (page)', 'page title');
  assertEqual(previewTitle('', 'component'), 'Untitled (component)', 'empty title');
  const longTitle = previewTitle('x'.repeat(100), 'page');
  assertEqual(longTitle.length, 87, 'truncated title with type');
  assertEqual(longTitle, `${'x'.repeat(79)}… (page)`, 'ellipsis title');
});

const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
console.log(`RESULT ${passed}/${cases.length} passed`);
if (failed > 0) process.exitCode = 1;
