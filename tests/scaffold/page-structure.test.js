const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('record pages declare expected component markers', () => {
  assert.match(readFile('pages/record-list/index.vue'), /space-header/);
  assert.match(readFile('pages/record-list/index.vue'), /record-filter-bar/);
  assert.match(readFile('pages/record-list/index.vue'), /record-card/);
  assert.match(readFile('pages/record-editor/index.vue'), /saveRecord/);
  assert.match(readFile('pages/record-editor/index.vue'), /chooseImages/);
  assert.match(readFile('pages/record-editor/index.vue'), /chooseVideo/);
});
