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

test('record editor waits for content security review results', () => {
  assert.match(
    readFile('services/record/index.js'),
    /getContentSecurityReview/
  );
  assert.match(
    readFile('pages/record-editor/index.vue'),
    /waitForContentReview/
  );
  assert.match(
    readFile('pages/record-editor/index.vue'),
    /所发布内容含违规信息/
  );
});

test('record cloud function declares content security OpenAPI permissions', () => {
  const config = JSON.parse(readFile('cloudfunctions/record/config.json'));

  assert.deepEqual(config.permissions.openapi, [
    'security.msgSecCheck',
    'security.mediaCheckAsync'
  ]);
});

test('record editor keeps pending reviews on the current page', () => {
  const source = readFile('pages/record-editor/index.vue');

  assert.match(source, /pendingReviewId/);
  assert.match(source, /内容仍在审核，请稍后继续查询/);
  assert.doesNotMatch(
    source,
    /内容仍在审核，请稍后继续查询[\s\S]{0,240}uni\.navigateBack/
  );
});

test('record editor starts image review after cloud upload', () => {
  const serviceSource = readFile('services/record/index.js');
  const editorSource = readFile('pages/record-editor/index.vue');
  const reviewSource = readFile('utils/media-review.js');

  assert.match(serviceSource, /createMediaReview/);
  assert.match(editorSource, /reviewUploadedImage/);
  assert.match(reviewSource, /status === 'passed'/);
  assert.match(reviewSource, /media: status === 'passed'/);
  assert.match(editorSource, /ensureMediaReviewsReady/);
  assert.match(editorSource, /图片正在审核，请稍后发布/);
});

test('record pages resolve shared media through the record cloud function', () => {
  const serviceSource = readFile('services/record/index.js');
  const listSource = readFile('pages/record-list/index.vue');
  const editorSource = readFile('pages/record-editor/index.vue');

  assert.match(serviceSource, /getMediaDisplayUrls/);
  assert.match(
    listSource,
    /resolveRecordsMediaDisplayUrls\(\s*records,\s*getMediaDisplayUrls\s*\)/
  );
  assert.match(
    editorSource,
    /resolveRecordMediaDisplayUrls\(\s*record,\s*getMediaDisplayUrls\s*\)/
  );
});

test('record list provides one keyboard-following comment composer', () => {
  const cardSource = readFile('components/record-card/index.vue');
  const listSource = readFile('pages/record-list/index.vue');

  assert.match(cardSource, /\$emit\('open-comment', this\.record\)/);
  assert.match(listSource, /@open-comment="openCommentComposer"/);
  assert.match(listSource, /v-if="commentComposerVisible"/);
  assert.match(listSource, /@click="closeCommentComposer"/);
  assert.match(listSource, /:style="commentComposerStyle"/);
  assert.match(listSource, /class="page__comment-bar"/);
  assert.match(listSource, /:style="commentInputStyle"/);
  assert.match(listSource, /:style="commentSubmitStyle"/);
  assert.match(
    listSource,
    /commentComposerStyle\(\)\s*\{\s*return `bottom: \$\{this\.commentKeyboardHeight\}px`/
  );
  assert.match(
    listSource,
    /commentInputStyle\(\)\s*\{\s*return `bottom: \$\{this\.commentKeyboardHeight \+ 8\}px`/
  );
  assert.match(
    listSource,
    /commentSubmitStyle\(\)\s*\{\s*return `bottom: \$\{this\.commentKeyboardHeight \+ 8\}px`/
  );
  assert.match(listSource, /<textarea/);
  assert.match(listSource, /:fixed="true"/);
  assert.match(listSource, /:adjust-position="true"/);
  assert.match(listSource, /@focus="handleCommentInputFocus"/);
  assert.match(listSource, /confirm-type="send"/);
  assert.match(listSource, /@confirm="submitComment"/);
  assert.match(listSource, /@click="submitComment"/);
  assert.match(
    listSource,
    /@keyboardheightchange="handleCommentKeyboardHeightChange"/
  );
  assert.match(
    listSource,
    /event\.detail && event\.detail\.height/
  );
  assert.match(listSource, /wx\.onKeyboardHeightChange/);

  const submitStart = listSource.indexOf('this.commentSubmitting = true');
  const dismissIndex = listSource.indexOf(
    'this.dismissCommentComposer()',
    submitStart
  );
  const requestIndex = listSource.indexOf(
    'await createRecordComment',
    submitStart
  );

  assert.ok(dismissIndex > submitStart);
  assert.ok(dismissIndex < requestIndex);
});
