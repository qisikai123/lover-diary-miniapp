# Couple Life Miniapp Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable `uni-app + uView + WeChat Cloud Development` scaffold for the couple life mini program, including page shells, shared services, and cloud function stubs.

**Architecture:** Use a Vue2-style `uni-app` project layout with two pages at the root app level, a thin service layer that wraps cloud-function calls, and small pure-JS utility modules that can be verified with Node's built-in test runner. The first pass focuses on structure and local correctness, not full deployment readiness, because the repository starts empty and dependency installation may require network approval.

**Tech Stack:** `uni-app`, `Vue2`, `JavaScript`, `uView` integration hooks, WeChat Cloud Development, Node built-in test runner

---

### Task 1: Create the base app manifest and route configuration

**Files:**
- Create: `App.vue`
- Create: `main.js`
- Create: `pages.json`
- Create: `manifest.json`
- Create: `uni.scss`
- Create: `package.json`

- [ ] **Step 1: Write the failing file-existence test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scaffold/base-files.test.js`
Expected: FAIL with at least one `should exist` assertion

- [ ] **Step 3: Write minimal implementation**

```json
{
  "name": "couple-life-miniapp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/**/*.test.js"
  }
}
```

```js
import Vue from 'vue'
import App from './App'

Vue.config.productionTip = false
App.mpType = 'app'

const app = new Vue({
  ...App
})

app.$mount()
```

```vue
<script>
export default {
  onLaunch() {},
  onShow() {},
  onHide() {}
}
</script>

<style lang="scss">
@import '@/uni.scss';
page {
  background: #f6f2ea;
  color: #2f241f;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
}
</style>
```

```json
{
  "pages": [
    {
      "path": "pages/record-list/index",
      "style": {
        "navigationBarTitleText": "我们的日常"
      }
    },
    {
      "path": "pages/record-editor/index",
      "style": {
        "navigationBarTitleText": "记录生活"
      }
    }
  ],
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarBackgroundColor": "#f6f2ea",
    "backgroundColor": "#f6f2ea"
  }
}
```

```json
{
  "name": "情侣生活记录",
  "appid": "__UNI__COUPLE_LIFE__",
  "description": "情侣生活记录微信小程序",
  "versionName": "0.1.0",
  "versionCode": "100",
  "transformPx": false,
  "mp-weixin": {
    "appid": "",
    "setting": {
      "urlCheck": false
    },
    "usingComponents": true
  }
}
```

```scss
$cl-color-bg: #f6f2ea;
$cl-color-card: #fffaf4;
$cl-color-primary: #d27d56;
$cl-color-text: #2f241f;
$cl-color-subtext: #7a675d;
$cl-color-border: #ecdccf;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scaffold/base-files.test.js`
Expected: PASS with `1 test` and `0 failures`

### Task 2: Add the page shells and presentational components

**Files:**
- Create: `pages/record-list/index.vue`
- Create: `pages/record-editor/index.vue`
- Create: `components/space-header/index.vue`
- Create: `components/record-card/index.vue`
- Create: `components/record-filter-bar/index.vue`
- Create: `components/record-media-grid/index.vue`

- [ ] **Step 1: Write the failing page-structure test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scaffold/page-structure.test.js`
Expected: FAIL because page files do not exist

- [ ] **Step 3: Write minimal implementation**

```vue
<template>
  <view class="page">
    <space-header :space="spaceProfile" />
    <record-filter-bar :value="filters" @change="handleFilterChange" />
    <view class="page__list">
      <record-card
        v-for="item in records"
        :key="item._id"
        :record="item"
        @edit="goEdit"
        @remove="handleRemove"
        @toggle-top="handleToggleTop"
      />
    </view>
    <view class="page__fab" @click="goCreate">+</view>
  </view>
</template>
```

```vue
<template>
  <view class="page">
    <textarea v-model="form.content" class="page__textarea" maxlength="1000" placeholder="写下今天的小日子..." />
    <view class="page__actions">
      <button @click="chooseImages">选择图片</button>
      <button @click="chooseVideo">选择视频</button>
    </view>
    <record-media-grid :items="mediaList" :mode="form.recordType" @remove="removeMedia" />
    <button class="page__submit" @click="saveRecord">保存记录</button>
  </view>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scaffold/page-structure.test.js`
Expected: PASS with `1 test` and `0 failures`

### Task 3: Add pure-JS record validation and normalization helpers

**Files:**
- Create: `utils/record.js`
- Test: `tests/utils/record.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createEmptyRecordDraft,
  inferRecordType,
  validateRecordDraft
} = require('../../utils/record');

test('inferRecordType returns text when there is no media', () => {
  assert.equal(inferRecordType([]), 'text');
});

test('inferRecordType returns image for image media', () => {
  assert.equal(inferRecordType([{ mediaType: 'image' }]), 'image');
});

test('validateRecordDraft rejects image and video mixed media', () => {
  const result = validateRecordDraft({
    content: 'weekend',
    mediaList: [
      { mediaType: 'image' },
      { mediaType: 'video' }
    ]
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /不能同时上传图片和视频/);
});

test('createEmptyRecordDraft returns the default editor state', () => {
  assert.deepEqual(createEmptyRecordDraft(), {
    content: '',
    recordDate: '',
    recordType: 'text',
    mediaList: []
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/utils/record.test.js`
Expected: FAIL with `Cannot find module '../../utils/record'`

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * 返回记录编辑页的默认表单。
 *
 * 约束：
 * 1. `recordType` 默认按纯文字处理
 * 2. `recordDate` 交给页面在加载时填入当天日期
 *
 * @returns {{content: string, recordDate: string, recordType: string, mediaList: Array}}
 */
function createEmptyRecordDraft() {
  return {
    content: '',
    recordDate: '',
    recordType: 'text',
    mediaList: []
  };
}

/**
 * 根据媒体列表推断记录类型。
 *
 * @param {Array<{mediaType: string}>} mediaList
 * @returns {'text'|'image'|'video'}
 */
function inferRecordType(mediaList) {
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    return 'text';
  }

  return mediaList[0].mediaType === 'video' ? 'video' : 'image';
}

/**
 * 校验记录草稿是否合法。
 *
 * 业务规则：
 * 1. 允许纯文字
 * 2. 图片和视频不能混发
 * 3. 图片最多 9 张，视频最多 1 个
 *
 * @param {{content?: string, mediaList?: Array<{mediaType: string}>}} draft
 * @returns {{valid: boolean, message: string}}
 */
function validateRecordDraft(draft) {
  const mediaList = Array.isArray(draft.mediaList) ? draft.mediaList : [];
  const hasImage = mediaList.some((item) => item.mediaType === 'image');
  const hasVideo = mediaList.some((item) => item.mediaType === 'video');

  if (hasImage && hasVideo) {
    return {
      valid: false,
      message: '不能同时上传图片和视频'
    };
  }

  if (mediaList.filter((item) => item.mediaType === 'image').length > 9) {
    return {
      valid: false,
      message: '图片最多上传9张'
    };
  }

  if (mediaList.filter((item) => item.mediaType === 'video').length > 1) {
    return {
      valid: false,
      message: '视频最多上传1个'
    };
  }

  return {
    valid: true,
    message: ''
  };
}

module.exports = {
  createEmptyRecordDraft,
  inferRecordType,
  validateRecordDraft
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/utils/record.test.js`
Expected: PASS with `4 tests` and `0 failures`

### Task 4: Add cloud service wrappers and cloud function stubs

**Files:**
- Create: `services/cloud/index.js`
- Create: `services/record/index.js`
- Create: `services/space/index.js`
- Create: `cloudfunctions/login/index.js`
- Create: `cloudfunctions/space/index.js`
- Create: `cloudfunctions/record/index.js`

- [ ] **Step 1: Write the failing service contract test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCloudFunctionPayload
} = require('../../services/cloud/index');

test('buildCloudFunctionPayload returns the expected action envelope', () => {
  assert.deepEqual(
    buildCloudFunctionPayload('record', 'getRecordList', { page: 1 }),
    {
      name: 'record',
      data: {
        action: 'getRecordList',
        payload: { page: 1 }
      }
    }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/cloud.test.js`
Expected: FAIL with `Cannot find module '../../services/cloud/index'`

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * 构建统一的云函数调用参数。
 *
 * 这样做是为了把 `action + payload` 协议固定下来，
 * 避免页面层直接散落云函数参数结构，后续调整时影响面过大。
 *
 * @param {string} name
 * @param {string} action
 * @param {Object} payload
 * @returns {{name: string, data: {action: string, payload: Object}}}
 */
function buildCloudFunctionPayload(name, action, payload) {
  return {
    name,
    data: {
      action,
      payload: payload || {}
    }
  };
}

module.exports = {
  buildCloudFunctionPayload
};
```

```js
exports.main = async (event) => {
  return {
    success: true,
    action: event.action || 'login',
    payload: event.payload || {},
    data: {}
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/cloud.test.js`
Expected: PASS with `1 test` and `0 failures`

### Task 5: Verify the scaffold footprint

**Files:**
- Verify only

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/**/*.test.js`
Expected: PASS with `0 failures`

- [ ] **Step 2: Inspect the created file tree**

Run: `find . -maxdepth 3 | sort`
Expected: output includes `pages`, `components`, `services`, `utils`, `cloudfunctions`, and `docs/superpowers`

- [ ] **Step 3: Document unresolved environment work**

Note in the final handoff that:
- `uView` dependency installation is still pending
- WeChat cloud environment ID still needs to be configured
- Deployment must happen from HBuilderX or WeChat DevTools because the repository started empty

## Self-Review

- Spec coverage: the plan covers the two pages, the cloud-development service boundary, the record data rules, and the first cloud-function stubs. The only spec items intentionally deferred are visual polish, member initialization UI, and full cloud database CRUD, which belong to the next implementation slice after the scaffold exists.
- Placeholder scan: no `TBD`, `TODO`, or "implement later" placeholders remain in the task steps.
- Type consistency: `recordType`, `mediaList`, `action`, and `payload` use the same names across tests and implementation steps.
