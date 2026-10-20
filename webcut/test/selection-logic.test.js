'use strict';

const {
  describeElement,
  isSelectable,
  pickTarget,
  pickParent,
  pickChild,
  createSelectionNav,
} = require('../shared/selection-logic.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function fake(tagName, fields) {
  const element = Object.assign({ tagName, id: '', className: '', parentElement: null, children: [] }, fields);
  element.contains = (target) => {
    if (target === element) return true;
    return element.children.some((child) => child === target || child.contains(target));
  };
  if (typeof element.getBoundingClientRect !== 'function') {
    element.getBoundingClientRect = () => ({ width: 1, height: 1 });
  }
  return element;
}

function link(parent, child) {
  child.parentElement = parent;
  parent.children.push(child);
  return child;
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

test('describeElement prefers id and formats lowercase rounded dimensions', () => {
  assertEqual(
    describeElement({ tagName: 'DIV', id: 'hero', className: 'card featured', width: 1200.4, height: 599.6 }),
    'div#hero 1200x600',
    'id description',
  );
});

test('describeElement uses the first nonempty class only when id is empty', () => {
  assertEqual(
    describeElement({ tagName: 'SECTION', id: '', className: '   card   featured ', width: 10.5, height: 20.49 }),
    'section.card 11x20',
    'class description',
  );
  assertEqual(
    describeElement({ tagName: 'ARTICLE', id: '', className: '   ', width: 1, height: 2 }),
    'article 1x2',
    'tag-only description',
  );
});

test('describeElement accepts an SVG className baseVal', () => {
  assertEqual(
    describeElement({ tagName: 'SVG', id: '', className: { baseVal: 'icon large' }, width: 9.5, height: 10.4 }),
    'svg.icon 10x10',
    'SVG class description',
  );
});

test('isSelectable rejects invalid and nonvisual tag names', () => {
  const host = fake('webcut-ui-root');
  for (const value of [null, {}, fake('html'), fake('body'), fake('webcut-ui-root'), fake('script'), fake('style'), fake('link'), fake('meta'), fake('head'), fake('title'), fake('noscript'), fake('template'), fake('base')]) {
    assertEqual(isSelectable(value, host), false, `rejected ${value && value.tagName}`);
  }
  assertEqual(isSelectable(fake('div'), host), true, 'div is selectable');
});

test('isSelectable rejects the host and anything host.contains includes', () => {
  const host = fake('webcut-ui-root');
  const child = link(host, fake('div'));
  assertEqual(isSelectable(host, host), false, 'host identity');
  assertEqual(isSelectable(child, host), false, 'host descendant');
  assertEqual(isSelectable(fake('div'), host), true, 'outside element');
  assertEqual(isSelectable(fake('webcut-ui-root')), false, 'host tag without host parameter');
});

test('pickTarget returns the first selectable element or null', () => {
  const host = fake('webcut-ui-root');
  const target = fake('div');
  const hostChild = link(host, fake('span'));
  assertEqual(pickTarget([null, fake('script'), hostChild, target], host), target, 'first valid target');
  assertEqual(pickTarget([null, fake('style'), host], host), null, 'no valid target');
});

test('pickParent uses only a selectable parentElement and stops before body', () => {
  const html = fake('html');
  const body = link(html, fake('body'));
  const child = link(body, fake('div'));
  assertEqual(pickParent(child), null, 'body is not a component target');
  assertEqual(pickParent(body), null, 'html excluded');
  assertEqual(pickParent(fake('div')), null, 'missing parent');
});

test('pickChild skips invalid and zero-size children', () => {
  const parent = fake('div');
  link(parent, fake('script'));
  link(parent, fake('span', { getBoundingClientRect: () => ({ width: 0, height: 20 }) }));
  link(parent, fake('style'));
  const child = link(parent, fake('article', { getBoundingClientRect: () => ({ width: 20, height: 10 }) }));
  assertEqual(pickChild(parent), child, 'first selectable nonzero child');
  assertEqual(pickChild(fake('div', { children: [fake('div', { getBoundingClientRect: () => ({ width: 0, height: 0 }) })] })), null, 'no visible child');
});

test('selection navigation supports current, up/down ancestor round trips, and unchanged boundaries', () => {
  const html = fake('html');
  const body = link(html, fake('body'));
  const section = link(body, fake('section'));
  const leaf = link(section, fake('button'));
  const nav = createSelectionNav();
  assertEqual(nav.current(), null, 'initial current');
  nav.set(leaf);
  assertEqual(nav.up(), section, 'up to section');
  assertEqual(nav.up(), section, 'body boundary remains unchanged');
  assertEqual(nav.down(), leaf, 'down to remembered leaf');
  assertEqual(nav.down(), leaf, 'leaf remains unchanged');
});

test('set clears history and reparented stale history falls back to pickChild', () => {
  const body = fake('body');
  const outer = link(body, fake('main'));
  const section = link(outer, fake('section'));
  const leaf = link(section, fake('button'));
  const replacement = link(outer, fake('article'));
  const nav = createSelectionNav();
  nav.set(leaf);
  nav.up();
  nav.up();
  section.parentElement = null;
  outer.children = [replacement];
  assertEqual(nav.down(), replacement, 'stale remembered target falls back to current child');
  nav.set(leaf);
  assertEqual(nav.current(), leaf, 'set current');
  assertEqual(nav.down(), leaf, 'set clears stale history');
});

test('reset clears current selection and navigation history', () => {
  const parent = fake('div');
  const child = link(parent, fake('span'));
  const nav = createSelectionNav();
  nav.set(child);
  nav.up();
  assertEqual(nav.reset(), null, 'reset return');
  assertEqual(nav.current(), null, 'reset current');
  assertEqual(nav.down(), null, 'reset history');
});

const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
console.log(`RESULT ${passed}/${cases.length} passed`);
if (failed > 0) process.exitCode = 1;
