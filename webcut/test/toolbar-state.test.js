'use strict';

const { createToolbarState } = require('../shared/toolbar-state.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
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

test('starts idle', () => {
  assertEqual(createToolbarState().get(), 'idle', 'initial state');
});

test('allows the valid transitions', () => {
  const toolbar = createToolbarState();
  assertEqual(toolbar.startExport(), true, 'idle to exporting');
  assertEqual(toolbar.get(), 'exporting', 'exporting state from idle');
  assertEqual(toolbar.finish(), true, 'exporting to idle');
  assertEqual(toolbar.get(), 'idle', 'finished state from idle export');
  assertEqual(toolbar.startSelecting(), true, 'idle to selecting');
  assertEqual(toolbar.get(), 'selecting', 'selecting state');
  assertEqual(toolbar.startExport(), true, 'selecting to exporting');
  assertEqual(toolbar.get(), 'exporting', 'exporting state');
  assertEqual(toolbar.finish(), true, 'exporting to idle');
  assertEqual(toolbar.get(), 'idle', 'finished state');
  assertEqual(toolbar.startSelecting(), true, 'second selection');
  assertEqual(toolbar.cancel(), true, 'selecting to idle');
  assertEqual(toolbar.get(), 'idle', 'cancelled state');
});

test('ignores invalid transitions', () => {
  const toolbar = createToolbarState();
  assertEqual(toolbar.cancel(), false, 'idle cannot cancel');
  assertEqual(toolbar.finish(), false, 'idle cannot finish');
  assertEqual(toolbar.get(), 'idle', 'idle remains unchanged');
  toolbar.startSelecting();
  assertEqual(toolbar.startSelecting(), false, 'selecting cannot restart selection');
  assertEqual(toolbar.finish(), false, 'selecting cannot finish');
  assertEqual(toolbar.get(), 'selecting', 'selecting remains unchanged');
});

test('ignores cancel while exporting', () => {
  const toolbar = createToolbarState();
  toolbar.startSelecting();
  toolbar.startExport();
  assertEqual(toolbar.cancel(), false, 'exporting cancel is ignored');
  assertEqual(toolbar.get(), 'exporting', 'exporting remains active');
});

test('notifies subscribers once for each valid transition', () => {
  const toolbar = createToolbarState();
  const calls = [];
  toolbar.subscribe((next) => calls.push(next));
  toolbar.startSelecting();
  toolbar.startExport();
  assertEqual(toolbar.cancel(), false, 'exporting cancel should not notify');
  toolbar.finish();
  assertEqual(calls.length, 3, 'subscriber call count');
  assertEqual(calls.join(','), 'selecting,exporting,idle', 'subscriber transitions');
});

test('unsubscribe stops notifications', () => {
  const toolbar = createToolbarState();
  let calls = 0;
  const unsubscribe = toolbar.subscribe(() => { calls += 1; });
  toolbar.startSelecting();
  unsubscribe();
  unsubscribe();
  toolbar.startExport();
  assertEqual(calls, 1, 'notifications after unsubscribe');
  assert(toolbar.get() === 'exporting', 'state still transitions after unsubscribe');
});

const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
console.log(`RESULT ${passed}/${cases.length} passed`);
if (failed > 0) process.exitCode = 1;
