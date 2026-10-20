'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const testRoot = path.join(root, 'webcut', 'test');

function collectTests(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...collectTests(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) results.push(entryPath);
  }
  return results.sort();
}

const tests = collectTests(testRoot);
let failures = 0;

for (const testPath of tests) {
  const relativePath = path.relative(root, testPath);
  const result = spawnSync(process.execPath, [testPath], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status === 0) {
    console.log(`PASS ${relativePath}`);
  } else {
    failures += 1;
    console.error(`FAIL ${relativePath} (exit ${result.status === null ? 'signal' : result.status})`);
  }
}

console.log(`RESULT ${tests.length - failures}/${tests.length} test files passed`);
process.exitCode = failures > 0 ? 1 : 0;
