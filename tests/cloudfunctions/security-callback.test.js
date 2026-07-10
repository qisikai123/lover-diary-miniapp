const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMemoryDb
} = require('../helpers/memory-cloud-db');
const {
  createSecurityCallbackHandler,
  createSecurityCallbackMain
} = require('../../cloudfunctions/security-callback/index');

function createPendingRecordPayload(content) {
  return {
    content,
    authorName: '小明',
    recordDate: '2026-07-10',
    recordType: 'image',
    mediaList: [
      {
        mediaType: 'image',
        url: 'cloud://image-a',
        name: ''
      }
    ],
    openid: 'openid-a',
    comments: [],
    isTop: false,
    topAt: 0,
    createdAt: 100,
    updatedAt: 100
  };
}

test('security callback publishes a reviewed record exactly once', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-1',
      openid: 'openid-a',
      operation: 'createRecord',
      recordId: '',
      payload: createPendingRecordPayload('approved record'),
      status: 'pending',
      checkCount: 1,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-image-a',
      reviewId: 'review-1',
      fileId: 'cloud://image-a',
      status: 'pending'
    }
  ]);
  const handler = createSecurityCallbackHandler({
    db,
    now: () => 200
  });

  const first = await handler({
    trace_id: 'trace-image-a',
    result: {
      suggest: 'pass'
    }
  });
  const duplicate = await handler({
    trace_id: 'trace-image-a',
    result: {
      suggest: 'pass'
    }
  });

  assert.equal(first.success, true);
  assert.equal(duplicate.success, true);
  assert.equal(db.records.rows.length, 1);
  assert.equal(db.records.rows[0].content, 'approved record');
  assert.equal(db.contentSecurityTasks.rows[0].status, 'passed');
  assert.equal(db.contentSecurityTasks.rows[0].resultRecordId, 'record-1');
});

test('security callback approves uploaded media without publishing a record', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-media-1',
      openid: 'openid-a',
      operation: 'reviewMedia',
      recordId: '',
      payload: {
        mediaList: [
          {
            mediaType: 'image',
            url: 'cloud://image-upload',
            name: ''
          }
        ]
      },
      status: 'pending',
      checkCount: 1,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-media-upload',
      reviewId: 'review-media-1',
      fileId: 'cloud://image-upload',
      status: 'pending'
    }
  ]);
  const handler = createSecurityCallbackHandler({
    db,
    now: () => 205
  });

  const result = await handler({
    trace_id: 'trace-media-upload',
    result: {
      suggest: 'pass'
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.status, 'passed');
  assert.equal(db.records.rows.length, 0);
  assert.equal(db.contentSecurityTasks.rows[0].status, 'passed');
  assert.equal(db.contentSecurityTasks.rows[0].resultRecordId, '');
});

test('security callback waits until every image passes', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-2',
      openid: 'openid-a',
      operation: 'createRecord',
      recordId: '',
      payload: createPendingRecordPayload('two images'),
      status: 'pending',
      checkCount: 2,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-image-a',
      reviewId: 'review-2',
      fileId: 'cloud://image-a',
      status: 'pending'
    },
    {
      _id: 'trace-image-b',
      reviewId: 'review-2',
      fileId: 'cloud://image-b',
      status: 'pending'
    }
  ]);
  const handler = createSecurityCallbackHandler({
    db,
    now: () => 210
  });

  await handler({
    trace_id: 'trace-image-a',
    result: {
      suggest: 'pass'
    }
  });

  assert.equal(db.records.rows.length, 0);
  assert.equal(db.contentSecurityTasks.rows[0].status, 'pending');

  await handler({
    trace_id: 'trace-image-b',
    result: {
      suggest: 'pass'
    }
  });

  assert.equal(db.records.rows.length, 1);
  assert.equal(db.contentSecurityTasks.rows[0].status, 'passed');
});

test('security callback rejects the entire task when one image is risky', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-3',
      openid: 'openid-a',
      operation: 'createRecord',
      recordId: '',
      payload: createPendingRecordPayload('rejected record'),
      status: 'pending',
      checkCount: 1,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-risky',
      reviewId: 'review-3',
      fileId: 'cloud://image-risky',
      status: 'pending'
    }
  ]);
  const handler = createSecurityCallbackHandler({
    db,
    now: () => 220
  });

  const result = await handler({
    trace_id: 'trace-risky',
    result: {
      suggest: 'risky',
      label: 100
    }
  });

  assert.equal(result.success, true);
  assert.equal(db.records.rows.length, 0);
  assert.equal(db.contentSecurityChecks.rows[0].status, 'rejected');
  assert.equal(db.contentSecurityTasks.rows[0].status, 'rejected');
  assert.equal(
    db.contentSecurityTasks.rows[0].message,
    '所发布内容含违规信息'
  );
});

test('security callback applies approved updates from an XML body', async () => {
  const db = createMemoryDb([
    {
      _id: 'record-1',
      openid: 'openid-a',
      content: 'before',
      recordDate: '2026-07-09',
      recordType: 'text',
      mediaList: []
    }
  ], [], [
    {
      _id: 'review-4',
      openid: 'openid-a',
      operation: 'updateRecord',
      recordId: 'record-1',
      payload: {
        content: 'after',
        recordDate: '2026-07-10',
        recordType: 'image',
        mediaList: [
          {
            mediaType: 'image',
            url: 'cloud://image-update',
            name: ''
          }
        ],
        updatedAt: 230
      },
      status: 'pending',
      checkCount: 1,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-update',
      reviewId: 'review-4',
      fileId: 'cloud://image-update',
      status: 'pending'
    }
  ]);
  const handler = createSecurityCallbackHandler({
    db,
    now: () => 230
  });

  const result = await handler({
    body: [
      '<xml>',
      '<trace_id>trace-update</trace_id>',
      '<suggest>pass</suggest>',
      '</xml>'
    ].join('')
  });

  assert.equal(result.success, true);
  assert.equal(db.records.rows.length, 1);
  assert.equal(db.records.rows[0].content, 'after');
  assert.equal(db.records.rows[0].recordType, 'image');
  assert.equal(db.contentSecurityTasks.rows[0].status, 'passed');
  assert.equal(db.contentSecurityTasks.rows[0].resultRecordId, 'record-1');
});

test('security callback HTTP entry validates the WeChat URL challenge', async () => {
  assert.equal(typeof createSecurityCallbackMain, 'function');

  const db = createMemoryDb();
  const main = createSecurityCallbackMain({
    db,
    callbackToken: 'AAAAA',
    now: () => 240
  });
  const response = await main({
    httpMethod: 'GET',
    queryStringParameters: {
      signature: 'f464b24fc39322e44b38aa78f5edd27bd1441696',
      echostr: '4375120948345356249',
      timestamp: '1714036504',
      nonce: '1514711492'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '4375120948345356249');
});

test('security callback HTTP entry rejects invalid signatures', async () => {
  assert.equal(typeof createSecurityCallbackMain, 'function');

  const db = createMemoryDb();
  const main = createSecurityCallbackMain({
    db,
    callbackToken: 'AAAAA',
    now: () => 250
  });
  const response = await main({
    httpMethod: 'POST',
    queryStringParameters: {
      signature: 'invalid',
      timestamp: '1714037059',
      nonce: '486452656'
    },
    body: JSON.stringify({
      trace_id: 'trace-image-a',
      result: {
        suggest: 'pass'
      }
    })
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body, 'invalid signature');
});

test('security callback HTTP entry rejects direct cloud function calls', async () => {
  const db = createMemoryDb([], [], [
    {
      _id: 'review-direct',
      openid: 'openid-a',
      operation: 'createRecord',
      recordId: '',
      payload: createPendingRecordPayload('direct callback'),
      status: 'pending',
      checkCount: 1,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-direct',
      reviewId: 'review-direct',
      fileId: 'cloud://image-direct',
      status: 'pending'
    }
  ]);
  const main = createSecurityCallbackMain({
    db,
    callbackToken: 'AAAAA',
    now: () => 255
  });
  const response = await main({
    trace_id: 'trace-direct',
    result: {
      suggest: 'pass'
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body, 'http callback required');
  assert.equal(db.records.rows.length, 0);
  assert.equal(db.contentSecurityTasks.rows[0].status, 'pending');
});

test('security callback HTTP entry handles signed JSON notifications', async () => {
  assert.equal(typeof createSecurityCallbackMain, 'function');

  const db = createMemoryDb([], [], [
    {
      _id: 'review-http',
      openid: 'openid-a',
      operation: 'createRecord',
      recordId: '',
      payload: createPendingRecordPayload('http callback'),
      status: 'pending',
      checkCount: 1,
      resultRecordId: ''
    }
  ], [
    {
      _id: 'trace-http',
      reviewId: 'review-http',
      fileId: 'cloud://image-http',
      status: 'pending'
    }
  ]);
  const main = createSecurityCallbackMain({
    db,
    callbackToken: 'AAAAA',
    now: () => 260
  });
  const response = await main({
    httpMethod: 'POST',
    queryStringParameters: {
      signature: '899cf89e464efb63f54ddac96b0a0a235f53aa78',
      timestamp: '1714037059',
      nonce: '486452656'
    },
    body: JSON.stringify({
      trace_id: 'trace-http',
      result: {
        suggest: 'pass'
      }
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'success');
  assert.equal(db.records.rows.length, 1);
  assert.equal(db.contentSecurityTasks.rows[0].status, 'passed');
});
