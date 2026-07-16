const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecordHandler: createRawRecordHandler
} = require('../../cloudfunctions/record/index');
const {
  createMemoryDb
} = require('../helpers/memory-cloud-db');

function createSafeTextCheck() {
  return Promise.resolve({
    result: {
      suggest: 'pass'
    }
  });
}

function createTempFileUrlResponse(fileList) {
  return Promise.resolve({
    fileList: fileList.map((fileID) => ({
      fileID,
      tempFileURL: `https://tmp.example.com/${fileID.slice('cloud://'.length)}.jpg`
    }))
  });
}

function createRecordHandler(options) {
  let traceSequence = 0;

  return createRawRecordHandler({
    checkText: createSafeTextCheck,
    checkMedia: () => {
      traceSequence += 1;

      return Promise.resolve({
        traceId: `default-trace-${traceSequence}`
      });
    },
    getTempFileURL: createTempFileUrlResponse,
    ...options
  });
}

test('record cloud function rejects openids outside configured entry whitelist', async () => {
  const db = createMemoryDb();
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-blocked',
    allowedOpenIds: ['openid-allowed']
  });

  const result = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '无权限');
});

test('record cloud function creates and lists records in product order', async () => {
  const db = createMemoryDb();
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 100
  });

  const createResult = await handler({
    action: 'createRecord',
    payload: {
      content: 'first day',
      authorName: '小明',
      recordDate: '2026-07-06',
      recordType: 'text',
      mediaList: []
    }
  });

  assert.equal(createResult.success, true);
  assert.equal(db.records.rows[0].openid, 'openid-a');
  assert.equal(db.records.rows[0].authorName, '小明');

  const listResult = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.deepEqual(listResult.data.list.map((item) => item.content), ['first day']);
  assert.deepEqual(listResult.data.list.map((item) => item.authorName), ['小明']);
});

test('record cloud function keeps image records pending until review passes', async () => {
  const db = createMemoryDb();
  const mediaCheckCalls = [];
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: createTempFileUrlResponse,
    checkText: createSafeTextCheck,
    checkMedia(params) {
      mediaCheckCalls.push(params);

      return Promise.resolve({
        traceId: `trace-${mediaCheckCalls.length}`
      });
    },
    now: () => 110
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'image record',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-a'
        },
        {
          mediaType: 'image',
          url: 'cloud://image-b'
        }
      ]
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.pendingReview, true);
  assert.equal(db.records.rows.length, 0);
  assert.equal(db.contentSecurityTasks.rows.length, 1);
  assert.deepEqual(
    db.contentSecurityChecks.rows.map((item) => item._id),
    ['trace-1', 'trace-2']
  );
  assert.deepEqual(
    mediaCheckCalls.map((item) => item.mediaUrl),
    [
      'https://tmp.example.com/image-a.jpg',
      'https://tmp.example.com/image-b.jpg'
    ]
  );
  assert.deepEqual(mediaCheckCalls[0], {
    mediaUrl: 'https://tmp.example.com/image-a.jpg',
    mediaType: 2,
    version: 2,
    scene: 4,
    openid: 'openid-a'
  });
});

test('record cloud function creates upload review without exposing diagnostics', async () => {
  const db = createMemoryDb();
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-sensitive',
    getTempFileURL: (fileList) => Promise.resolve({
      fileList: fileList.map((fileID) => ({
        fileID,
        tempFileURL: 'https://tmp.example.com/image-upload.jpg?token=secret'
      }))
    }),
    checkMedia: () => Promise.resolve({
      traceId: 'trace-upload-review'
    }),
    now: () => 112
  });

  const result = await handler({
    action: 'createMediaReview',
    payload: {
      media: {
        mediaType: 'image',
        url: 'cloud://image-upload',
        name: 'upload.jpg'
      }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.pendingReview, true);
  assert.deepEqual(Object.keys(result.data).sort(), [
    'pendingReview',
    'reviewId'
  ]);
  assert.equal(db.contentSecurityTasks.rows[0].operation, 'reviewMedia');
  assert.equal(
    db.contentSecurityTasks.rows[0].payload.mediaList[0].url,
    'cloud://image-upload'
  );
  assert.equal(db.contentSecurityChecks.rows[0]._id, 'trace-upload-review');
});

test('record cloud function reuses an approved upload review when publishing', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-upload-passed',
      openid: 'openid-a',
      operation: 'reviewMedia',
      payload: {
        mediaList: [
          {
            mediaType: 'image',
            url: 'cloud://image-approved',
            name: ''
          }
        ]
      },
      status: 'passed'
    }
  ]);
  let mediaCheckCalled = false;
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    checkText: createSafeTextCheck,
    checkMedia: () => {
      mediaCheckCalled = true;
      throw new Error('approved media must not be checked again');
    },
    now: () => 113
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'approved upload',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-approved',
          reviewId: 'review-upload-passed'
        }
      ]
    }
  });

  assert.equal(result.success, true);
  assert.equal(mediaCheckCalled, false);
  assert.equal(db.records.rows.length, 1);
  assert.equal(
    db.records.rows[0].mediaList[0].reviewId,
    'review-upload-passed'
  );
});

test('record cloud function does not duplicate a pending upload review', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-upload-pending',
      openid: 'openid-a',
      operation: 'reviewMedia',
      payload: {
        mediaList: [
          {
            mediaType: 'image',
            url: 'cloud://image-pending',
            name: ''
          }
        ]
      },
      status: 'pending'
    }
  ]);
  let mediaCheckCalled = false;
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    checkText: createSafeTextCheck,
    checkMedia: () => {
      mediaCheckCalled = true;
      return Promise.resolve({
        traceId: 'duplicate-trace'
      });
    },
    now: () => 114
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'pending upload',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-pending',
          reviewId: 'review-upload-pending'
        }
      ]
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '图片正在审核，请稍后发布');
  assert.equal(mediaCheckCalled, false);
  assert.equal(db.contentSecurityTasks.rows.length, 1);
  assert.equal(db.records.rows.length, 0);
});

test('record cloud function starts multiple image checks concurrently', async () => {
  const db = createMemoryDb();
  let activeChecks = 0;
  let maxActiveChecks = 0;
  let traceSequence = 0;
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: createTempFileUrlResponse,
    checkText: createSafeTextCheck,
    async checkMedia() {
      activeChecks += 1;
      maxActiveChecks = Math.max(maxActiveChecks, activeChecks);
      traceSequence += 1;
      const traceId = `parallel-trace-${traceSequence}`;

      await new Promise((resolve) => setTimeout(resolve, 10));
      activeChecks -= 1;

      return {
        traceId
      };
    },
    now: () => 115
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'parallel image review',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-a'
        },
        {
          mediaType: 'image',
          url: 'cloud://image-b'
        },
        {
          mediaType: 'image',
          url: 'cloud://image-c'
        }
      ]
    }
  });

  assert.equal(result.success, true);
  assert.equal(maxActiveChecks, 3);
  assert.equal(db.contentSecurityChecks.rows.length, 3);
});

test('record cloud function keeps published record unchanged while image update is pending', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      openid: 'openid-a',
      content: 'before',
      recordDate: '2026-07-09',
      recordType: 'text',
      mediaList: []
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: createTempFileUrlResponse,
    checkText: createSafeTextCheck,
    checkMedia: () => Promise.resolve({
      traceId: 'trace-update'
    }),
    now: () => 120
  });

  const result = await handler({
    action: 'updateRecord',
    payload: {
      _id: 'record-1',
      content: 'after',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-update'
        }
      ]
    }
  });

  assert.equal(result.data.pendingReview, true);
  assert.equal(db.records.rows[0].content, 'before');
  assert.equal(db.contentSecurityTasks.rows[0].operation, 'updateRecord');
  assert.equal(db.contentSecurityTasks.rows[0].recordId, 'record-1');
});

test('record cloud function detects images even when media type is forged', async () => {
  const db = createMemoryDb();
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    downloadFile: () => Promise.resolve(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    ),
    checkMedia: () => Promise.resolve({
      traceId: 'trace-forged-image'
    }),
    now: () => 125
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'forged media type',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'video',
          url: 'cloud://records/videos/forged.mp4'
        }
      ]
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.pendingReview, true);
  assert.equal(db.records.rows.length, 0);
  assert.equal(
    db.contentSecurityChecks.rows[0].fileId,
    'cloud://records/videos/forged.mp4'
  );
});

test('record cloud function does not classify an MP4 file as an image', async () => {
  const db = createMemoryDb();
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    downloadFile: () => Promise.resolve(
      Buffer.from([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70,
        0x6d, 0x70, 0x34, 0x32
      ])
    ),
    now: () => 127
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'video record',
      recordDate: '2026-07-10',
      mediaList: [
        {
          mediaType: 'video',
          url: 'cloud://records/videos/video.mp4'
        }
      ]
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.pendingReview, undefined);
  assert.equal(db.records.rows.length, 1);
  assert.equal(db.contentSecurityTasks.rows.length, 0);
});

test('record cloud function rejects risky record text', async () => {
  const db = createMemoryDb();
  const textCheckCalls = [];
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    checkText(params) {
      textCheckCalls.push(params);

      return Promise.resolve({
        result: {
          suggest: 'risky'
        }
      });
    },
    now: () => 130
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'risky content',
      recordDate: '2026-07-10',
      mediaList: []
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '所发布内容含违规信息');
  assert.equal(db.records.rows.length, 0);
  assert.deepEqual(textCheckCalls[0], {
    content: 'risky content',
    version: 2,
    scene: 4,
    openid: 'openid-a'
  });
});

test('record cloud function fails closed when text checker is missing', async () => {
  const db = createMemoryDb();
  const handler = createRawRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 135
  });

  const result = await handler({
    action: 'createRecord',
    payload: {
      content: 'must be checked',
      recordDate: '2026-07-10',
      mediaList: []
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '内容安全检测失败，请稍后重试');
  assert.equal(db.records.rows.length, 0);
});

test('record cloud function rejects risky comment text', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'safe record',
      recordDate: '2026-07-10',
      recordType: 'text',
      mediaList: [],
      comments: []
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    checkText: () => Promise.resolve({
      result: {
        suggest: 'review'
      }
    }),
    now: () => 140
  });

  const result = await handler({
    action: 'createComment',
    payload: {
      recordId: 'record-1',
      content: 'risky comment'
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '所发布内容含违规信息');
  assert.equal(db.records.rows[0].comments.length, 0);
});

test('record cloud function only exposes review status to its creator', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-1',
      openid: 'openid-a',
      status: 'rejected',
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-review-1',
      reviewId: 'review-1',
      fileId: 'cloud://image-review',
      status: 'rejected'
    }
  ]);
  const ownerHandler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 150
  });
  const otherHandler = createRecordHandler({
    db,
    getOpenId: () => 'openid-b',
    now: () => 150
  });

  const ownerResult = await ownerHandler({
    action: 'getContentSecurityReview',
    payload: {
      reviewId: 'review-1'
    }
  });
  const otherResult = await otherHandler({
    action: 'getContentSecurityReview',
    payload: {
      reviewId: 'review-1'
    }
  });

  assert.equal(ownerResult.success, true);
  assert.equal(ownerResult.data.status, 'rejected');
  assert.equal(ownerResult.data.message, '所发布内容含违规信息');
  assert.equal('checks' in ownerResult.data, false);
  assert.equal(otherResult.success, false);
  assert.equal(otherResult.message, '审核任务不存在');
});

test('record cloud function uses current user nickname when author name is missing', async () => {
  const db = createMemoryDb([], [
    {
      _id: 'user-1',
      openid: 'openid-a',
      nickname: '小红'
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 150
  });

  const createResult = await handler({
    action: 'createRecord',
    payload: {
      content: 'from phone',
      recordDate: '2026-07-07',
      mediaList: []
    }
  });

  assert.equal(createResult.success, true);
  assert.equal(db.records.rows[0].authorName, '小红');
});

test('record cloud function returns author name field for legacy list records', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'legacy',
      recordDate: '2026-07-07',
      recordType: 'text',
      mediaList: [],
      createdAt: 1
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 175
  });

  const listResult = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.equal(listResult.success, true);
  assert.equal(listResult.data.list[0].authorName, '我们');
});

test('record cloud function returns list media without resolving temporary urls', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'image',
      recordDate: '2026-07-07',
      recordType: 'image',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-a'
        }
      ],
      createdAt: 1
    }
  ]);
  let tempFileUrlCalled = false;
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: () => {
      tempFileUrlCalled = true;
      throw new Error('list must not resolve temporary media urls');
    },
    now: () => 180
  });

  const listResult = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.equal(listResult.success, true);
  assert.equal(tempFileUrlCalled, false);
  assert.equal(listResult.data.list[0].mediaList[0].url, 'cloud://image-a');
  assert.equal(listResult.data.list[0].mediaList[0].displayUrl, undefined);
});

test('record cloud function resolves another user record media on the server', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-other-user',
      openid: 'openid-b',
      content: 'shared image',
      recordDate: '2026-07-07',
      recordType: 'image',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-from-other-user'
        }
      ],
      createdAt: 1
    }
  ]);
  const tempFileUrlCalls = [];
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL(fileList) {
      tempFileUrlCalls.push(fileList);

      return createTempFileUrlResponse(fileList);
    },
    now: () => 190
  });

  const result = await handler({
    action: 'getMediaDisplayUrls',
    payload: {
      fileList: [
        'cloud://image-from-other-user',
        'cloud://unreferenced-private-file'
      ]
    }
  });

  assert.equal(result.success, true);
  assert.deepEqual(tempFileUrlCalls, [['cloud://image-from-other-user']]);
  assert.deepEqual(result.data.fileList, [
    {
      fileID: 'cloud://image-from-other-user',
      tempFileURL: 'https://tmp.example.com/image-from-other-user.jpg'
    }
  ]);
});

test('record cloud function updates and returns record detail', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'before',
      recordDate: '2026-07-05',
      recordType: 'text',
      mediaList: [],
      createdAt: 1
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 200
  });

  await handler({
    action: 'updateRecord',
    payload: {
      _id: 'record-1',
      content: 'after',
      recordDate: '2026-07-06',
      mediaList: []
    }
  });

  const detailResult = await handler({
    action: 'getRecordDetail',
    payload: {
      id: 'record-1'
    }
  });

  assert.equal(detailResult.data.record.content, 'after');
  assert.equal(detailResult.data.record.updatedAt, 200);
});

test('record cloud function strips temporary display urls from pending updates', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'before',
      recordDate: '2026-07-05',
      recordType: 'image',
      mediaList: [],
      createdAt: 1
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: createTempFileUrlResponse,
    checkText: createSafeTextCheck,
    checkMedia: () => Promise.resolve({
      traceId: 'trace-normalized-update'
    }),
    now: () => 215
  });

  const result = await handler({
    action: 'updateRecord',
    payload: {
      _id: 'record-1',
      content: 'after',
      recordDate: '2026-07-06',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-a',
          displayUrl: 'https://tmp.example.com/image-a.jpg'
        }
      ]
    }
  });

  assert.equal(result.data.pendingReview, true);
  assert.deepEqual(db.records.rows[0].mediaList, []);
  assert.deepEqual(db.contentSecurityTasks.rows[0].payload.mediaList, [
    {
      mediaType: 'image',
      url: 'cloud://image-a',
      name: ''
    }
  ]);
});

test('record cloud function returns detail media without resolving temporary urls', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'detail image',
      recordDate: '2026-07-05',
      recordType: 'image',
      mediaList: [
        {
          mediaType: 'image',
          url: 'cloud://image-detail'
        }
      ],
      createdAt: 1
    }
  ]);
  let tempFileUrlCalled = false;
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: () => {
      tempFileUrlCalled = true;
      throw new Error('detail must not resolve temporary media urls');
    },
    now: () => 225
  });

  const detailResult = await handler({
    action: 'getRecordDetail',
    payload: {
      id: 'record-1'
    }
  });

  assert.equal(detailResult.success, true);
  assert.equal(tempFileUrlCalled, false);
  assert.equal(detailResult.data.record.mediaList[0].url, 'cloud://image-detail');
  assert.equal(detailResult.data.record.mediaList[0].displayUrl, undefined);
});

test('record cloud function does not overwrite author name while editing records', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'before',
      authorName: '原发布人',
      recordDate: '2026-07-05',
      recordType: 'text',
      mediaList: [],
      createdAt: 1
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 250
  });

  await handler({
    action: 'updateRecord',
    payload: {
      _id: 'record-1',
      content: 'after',
      recordDate: '2026-07-06',
      mediaList: []
    }
  });

  assert.equal(db.records.rows[0].authorName, '原发布人');
});

test('record cloud function toggles top and removes records', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'top me',
      recordDate: '2026-07-06',
      recordType: 'text',
      mediaList: []
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 300
  });

  await handler({
    action: 'toggleRecordTop',
    payload: {
      id: 'record-1',
      isTop: true
    }
  });

  assert.equal(db.records.rows[0].isTop, true);
  assert.equal(db.records.rows[0].topAt, 300);

  await handler({
    action: 'removeRecord',
    payload: {
      id: 'record-1'
    }
  });

  assert.equal(db.records.rows.length, 0);
});

test('record cloud function creates comments with current user identity', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'with comments',
      recordDate: '2026-07-06',
      recordType: 'text',
      mediaList: [],
      comments: []
    }
  ], [
    {
      _id: 'user-1',
      openid: 'openid-a',
      nickname: '小红'
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 500
  });

  const result = await handler({
    action: 'createComment',
    payload: {
      recordId: 'record-1',
      content: '今天很开心'
    }
  });

  assert.equal(result.success, true);
  assert.equal(db.records.rows[0].comments.length, 1);
  assert.equal(db.records.rows[0].comments[0].openid, 'openid-a');
  assert.equal(db.records.rows[0].comments[0].authorName, '小红');
  assert.equal(db.records.rows[0].comments[0].content, '今天很开心');
  assert.equal(db.records.rows[0].comments[0].createdAt, 500);
});

test('record cloud function only lets comment owner remove comments', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'with comments',
      recordDate: '2026-07-06',
      recordType: 'text',
      mediaList: [],
      comments: [
        {
          id: 'comment-1',
          openid: 'openid-a',
          authorName: '小红',
          content: '可删除',
          createdAt: 480
        }
      ]
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-b',
    now: () => 550
  });

  const deniedResult = await handler({
    action: 'removeComment',
    payload: {
      recordId: 'record-1',
      commentId: 'comment-1'
    }
  });

  assert.equal(deniedResult.success, false);
  assert.match(deniedResult.message, /只能删除自己的评论/);
  assert.equal(db.records.rows[0].comments.length, 1);
});

test('record cloud function removes comments for comment owner', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      content: 'with comments',
      recordDate: '2026-07-06',
      recordType: 'text',
      mediaList: [],
      comments: [
        {
          id: 'comment-1',
          openid: 'openid-a',
          authorName: '小红',
          content: '可删除',
          createdAt: 480
        }
      ]
    }
  ]);
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 600
  });

  const result = await handler({
    action: 'removeComment',
    payload: {
      recordId: 'record-1',
      commentId: 'comment-1'
    }
  });

  assert.equal(result.success, true);
  assert.equal(db.records.rows[0].comments.length, 0);
});

test('record cloud function returns setup guidance when records collection is missing', async () => {
  const db = {
    collection() {
      return {
        get() {
          return Promise.reject(new Error('collection.get:fail -502005 database collection not exists'));
        }
      };
    }
  };
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 400
  });

  const result = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.equal(result.success, false);
  assert.match(result.message, /records 未创建/);
  assert.deepEqual(result.data, {
    list: [],
    total: 0
  });
});
