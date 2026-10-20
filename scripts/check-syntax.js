'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const skipped = new Set(['.git', 'node_modules', '.opencode']);

function collectJavaScript(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...collectJavaScript(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) results.push(entryPath);
  }
  return results.sort();
}

const files = collectJavaScript(root);
let failures = 0;

for (const filePath of files) {
  const relativePath = path.relative(root, filePath);
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status === 0) {
    console.log(`PASS node --check ${relativePath}`);
  } else {
    failures += 1;
    console.error(`FAIL node --check ${relativePath}`);
  }
}

console.log(`RESULT ${files.length - failures}/${files.length} JavaScript files passed`);
process.exitCode = failures > 0 ? 1 : 0;
