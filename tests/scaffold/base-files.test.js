const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appFiles = [
  'App.vue',
  'main.js',
  'pages.json',
  'manifest.json',
  'uni.scss',
  'package.json'
];

test('base uni-app files exist', () => {
  appFiles.forEach((filePath) => {
    const absolutePath = path.join(process.cwd(), filePath);
    assert.equal(fs.existsSync(absolutePath), true, `${filePath} should exist`);
  });
});
