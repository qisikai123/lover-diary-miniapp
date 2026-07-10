# Content Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure record images, record text, and comments pass WeChat content security checks before they become publicly visible.

**Architecture:** The `record` cloud function is the only publication boundary. Text is checked synchronously with `msgSecCheck`; image records create a pending review task and one trace record per image through `mediaCheckAsync`. A separate callback cloud function applies the pending create or update exactly once after all image traces pass.

**Tech Stack:** Vue 2, uni-app, JavaScript, Node.js test runner, WeChat Cloud Development, `wx-server-sdk` 4.0.2.

---

### Task 1: Shared In-Memory Cloud Database Test Helper

**Files:**
- Create: `tests/helpers/memory-cloud-db.js`
- Modify: `tests/cloudfunctions/record.test.js`
- Test: `tests/cloudfunctions/record.test.js`

- [ ] **Step 1: Extract the existing memory database helper**

Create a helper that supports `get`, `where().get`, `where().update`, `add`,
`doc().get`, `doc().update`, and `doc().remove`. `where().update` must return
`stats.updated` so callback tests can model compare-and-set task claiming.

```js
function createMemoryCollection(initialRows) {
  const rows = (initialRows || []).map((item) => ({ ...item }))

  return {
    rows,
    where(query) {
      return {
        get() {
          return Promise.resolve({
            data: rows.filter((item) => matchesQuery(item, query)),
          })
        },
        update({ data }) {
          let updated = 0
          rows.forEach((item, index) => {
            if (matchesQuery(item, query)) {
              rows[index] = { ...item, ...data }
              updated += 1
            }
          })
          return Promise.resolve({ stats: { updated } })
        },
      }
    },
  }
}
```

- [ ] **Step 2: Run record cloud function tests**

Run: `node --test tests/cloudfunctions/record.test.js`

Expected: all existing record tests pass with no behavior changes.

- [ ] **Step 3: Commit the test helper refactor**

```bash
git add tests/helpers/memory-cloud-db.js tests/cloudfunctions/record.test.js
git commit -m "test(cloud): share memory database helper"
```

### Task 2: Record and Comment Security Boundary

**Files:**
- Modify: `tests/cloudfunctions/record.test.js`
- Modify: `cloudfunctions/record/index.js`

- [ ] **Step 1: Write failing tests for image review and text rejection**

Add tests proving:

```js
test('record cloud function keeps image records pending until review passes', async () => {
  const db = createMemoryDb()
  const handler = createSecureRecordHandler({
    db,
    checkMedia: async () => ({ traceId: 'trace-image-a' }),
  })

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'image record',
      recordDate: '2026-07-10',
      mediaList: [{ mediaType: 'image', url: 'cloud://image-a' }],
    },
  })

  assert.equal(result.data.pendingReview, true)
  assert.equal(db.records.rows.length, 0)
  assert.equal(db.contentSecurityTasks.rows.length, 1)
  assert.equal(db.contentSecurityChecks.rows[0]._id, 'trace-image-a')
})
```

Also test that `msgSecCheck` returning `result.suggest = 'risky'` rejects record
creation and comment creation with `所发布内容含违规信息`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/cloudfunctions/record.test.js`

Expected: FAIL because image submissions are still written immediately and text is not checked.

- [ ] **Step 3: Implement text safety normalization**

Add an injected `checkText` dependency and call it with:

```js
{
  content,
  version: 2,
  scene: 4,
  openid,
}
```

Only `suggest === 'pass'` is accepted. `risky` and `review` return
`所发布内容含违规信息`; missing or failed results return
`内容安全检测失败，请稍后重试`.

- [ ] **Step 4: Implement pending image review creation**

For image media:

1. Resolve all cloud file IDs with `getTempFileURL`
2. Create a `content_security_tasks` document with status `preparing`
3. Call `checkMedia` once per image:

```js
{
  mediaUrl: tempFileURL,
  mediaType: 2,
  version: 2,
  scene: 4,
  openid,
}
```

4. Store each returned `traceId` as `_id` in `content_security_checks`
5. Mark the task `pending`
6. Return `{ pendingReview: true, reviewId }` without writing `records`

Edits must verify record ownership and store the pending update without changing
the current record.

- [ ] **Step 5: Detect images when clients forge media types**

Download media not declared as images and inspect common image file signatures.
Detected images must enter `mediaCheckAsync`; real MP4 files remain on the video
path. Reject requests that mix detected images and videos.

- [ ] **Step 6: Implement review status query**

Add action `getContentSecurityReview`. It returns only the current user's task:

```js
{
  reviewId,
  status: task.status,
  resultRecordId: task.resultRecordId || '',
  message: task.status === 'rejected'
    ? '所发布内容含违规信息'
    : task.message || '',
}
```

- [ ] **Step 7: Wire production OpenAPI dependencies**

Inject:

```js
checkText: (params) => cloud.openapi.security.msgSecCheck(params),
checkMedia: (params) => cloud.openapi.security.mediaCheckAsync(params),
```

- [ ] **Step 8: Run tests and verify GREEN**

Run: `node --test tests/cloudfunctions/record.test.js`

Expected: all record cloud function tests pass.

- [ ] **Step 9: Commit the server publication boundary**

```bash
git add tests/cloudfunctions/record.test.js cloudfunctions/record/index.js
git commit -m "feat(security): gate record publication"
```

### Task 3: Idempotent Media Review Callback

**Files:**
- Create: `tests/cloudfunctions/security-callback.test.js`
- Create: `cloudfunctions/security-callback/index.js`
- Create: `cloudfunctions/security-callback/package.json`

- [ ] **Step 1: Write failing callback tests**

Cover:

```js
test('security callback publishes a reviewed record exactly once', async () => {
  const first = await handler({
    trace_id: 'trace-image-a',
    result: { suggest: 'pass' },
  })
  const duplicate = await handler({
    trace_id: 'trace-image-a',
    result: { suggest: 'pass' },
  })

  assert.equal(first.success, true)
  assert.equal(duplicate.success, true)
  assert.equal(db.records.rows.length, 1)
  assert.equal(db.contentSecurityTasks.rows[0].status, 'passed')
})
```

Also cover one rejected trace, an approved update, multiple-image completion, and
an XML callback body containing `trace_id` and `suggest`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/cloudfunctions/security-callback.test.js`

Expected: FAIL because the callback cloud function does not exist.

- [ ] **Step 3: Implement callback event normalization**

Accept direct JSON, `{ body: Object }`, and XML string bodies. Normalize to:

```js
{
  traceId,
  suggestion,
}
```

Only `pass` becomes `passed`; every other result becomes `rejected`.

- [ ] **Step 4: Implement trace update and task finalization**

1. Load `content_security_checks.doc(traceId)`
2. Update only that trace result
3. Reject the parent task immediately for a non-pass result
4. Query all checks for `reviewId`
5. When all pass, claim the task with:

```js
tasks.where({
  _id: reviewId,
  status: 'pending',
}).update({
  data: {
    status: 'processing',
    updatedAt: now(),
  },
})
```

6. Only the caller with `stats.updated === 1` may create or update the record
7. Mark the task `passed`; reset to `pending` and throw if persistence fails

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/cloudfunctions/security-callback.test.js`

Expected: all callback tests pass, including duplicate callback tests.

- [ ] **Step 6: Add the signed HTTP message push entry**

Expose the callback through CloudBase HTTP access. Validate
`signature = sha1(sort(Token, timestamp, nonce).join(''))`, return `echostr` for
the GET challenge, accept signed JSON or XML POST bodies, and reply `success`.
Read the Token from `SECURITY_CALLBACK_TOKEN`; missing or invalid signatures
must return HTTP 403 without changing review data. Direct `wx.cloud.callFunction`
requests must also return HTTP 403 and must not invoke the internal callback
handler.

- [ ] **Step 7: Commit the callback**

```bash
git add tests/cloudfunctions/security-callback.test.js cloudfunctions/security-callback
git commit -m "feat(security): handle media review callbacks"
```

### Task 4: Client Review Polling and Generic Violation Message

**Files:**
- Modify: `tests/scaffold/page-structure.test.js`
- Modify: `services/record/index.js`
- Modify: `pages/record-editor/index.vue`

- [ ] **Step 1: Write failing structural tests**

Require the editor and service to contain:

```js
assert.match(readFile('services/record/index.js'), /getContentSecurityReview/)
assert.match(readFile('pages/record-editor/index.vue'), /waitForContentReview/)
assert.match(
  readFile('pages/record-editor/index.vue'),
  /所发布内容含违规信息/
)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/scaffold/page-structure.test.js`

Expected: FAIL because review polling does not exist.

- [ ] **Step 3: Add the review status service**

```js
function getContentSecurityReview(payload) {
  return callCloudFunction('record', 'getContentSecurityReview', payload)
}
```

- [ ] **Step 4: Split editor save handling into focused methods**

`saveRecord` submits once. `handleSaveResult` either finishes immediately or calls
`waitForContentReview(reviewId)`. Poll every two seconds for at most fifteen
attempts:

- `passed`: show `已保存` and navigate back
- `rejected`: show only `所发布内容含违规信息`
- `failed`: show `内容安全检测失败，请稍后重试`
- timeout: show `内容审核中，请稍后查看` and navigate back

Keep each method below 30 lines and do not place polling expressions in the template.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/scaffold/page-structure.test.js`

Expected: all page structure tests pass.

- [ ] **Step 6: Commit the client flow**

```bash
git add tests/scaffold/page-structure.test.js services/record/index.js pages/record-editor/index.vue
git commit -m "feat(editor): wait for image review"
```

### Task 5: Full Verification and Deployment Guidance

**Files:**
- Modify: `docs/superpowers/specs/2026-07-10-content-security-design.md`
- Modify: `docs/superpowers/plans/2026-07-10-content-security.md`

- [ ] **Step 1: Run focused cloud tests**

Run:

```bash
node --test tests/cloudfunctions/record.test.js
node --test tests/cloudfunctions/security-callback.test.js
```

Expected: all focused tests pass.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests pass. Do not run `npm run build`.

- [ ] **Step 3: Check source and formatting**

Run:

```bash
git diff --check
rg -n "Generated by AI|AI generated|TODO later|临时处理|待优化" \
  cloudfunctions pages services tests
```

Expected: no diff errors and no prohibited comments.

- [ ] **Step 4: Review publication safety**

Confirm from tests and code:

- no image record is visible before all callbacks pass
- a rejected image never writes or updates `records`
- duplicate callbacks cannot duplicate records
- client messages never expose WeChat labels
- security API failures do not fall back to direct publication

- [ ] **Step 5: Commit documentation refinements**

```bash
git add docs/superpowers/specs/2026-07-10-content-security-design.md \
  docs/superpowers/plans/2026-07-10-content-security.md
git commit -m "docs(security): detail moderation deployment"
```
