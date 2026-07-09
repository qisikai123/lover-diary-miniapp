const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecordHandler
} = require('../../cloudfunctions/record/index');

function createMemoryCollection(initialRows) {
  const rows = (initialRows || []).map((item) => ({ ...item }));

  return {
    rows,
    get() {
      return Promise.resolve({
        data: rows.slice()
      });
    },
    where(query) {
      return {
        get() {
          return Promise.resolve({
            data: rows.filter((item) => Object.keys(query).every((key) => item[key] === query[key]))
          });
        }
      };
    },
    add({ data }) {
      const _id = data._id || `record-${rows.length + 1}`;
      rows.push({
        ...data,
        _id
      });

      return Promise.resolve({
        _id
      });
    },
    doc(id) {
      return {
        get() {
          return Promise.resolve({
            data: rows.find((item) => item._id === id) || null
          });
        },
        update({ data }) {
          const index = rows.findIndex((item) => item._id === id);

          if (index >= 0) {
            rows[index] = {
              ...rows[index],
              ...data
            };
          }

          return Promise.resolve({
            stats: {
              updated: index >= 0 ? 1 : 0
            }
          });
        },
        remove() {
          const index = rows.findIndex((item) => item._id === id);

          if (index >= 0) {
            rows.splice(index, 1);
          }

          return Promise.resolve({
            stats: {
              removed: index >= 0 ? 1 : 0
            }
          });
        }
      };
    }
  };
}

function createMemoryDb(initialRecords, initialUsers) {
  const records = createMemoryCollection(initialRecords);
  const users = createMemoryCollection(initialUsers);

  return {
    records,
    users,
    collection(name) {
      if (name === 'records') {
        return records;
      }

      if (name === 'users') {
        return users;
      }

      throw new Error(`unexpected collection ${name}`);
    }
  };
}

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

test('record cloud function resolves media display urls for record list', async () => {
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
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: (fileList) => Promise.resolve({
      fileList: fileList.map((fileID) => ({
        fileID,
        tempFileURL: `https://tmp.example.com/${fileID.slice('cloud://'.length)}.jpg`
      }))
    }),
    now: () => 180
  });

  const listResult = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.equal(listResult.success, true);
  assert.equal(listResult.data.list[0].mediaList[0].url, 'cloud://image-a');
  assert.equal(
    listResult.data.list[0].mediaList[0].displayUrl,
    'https://tmp.example.com/image-a.jpg'
  );
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

test('record cloud function strips temporary display urls while updating records', async () => {
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
    now: () => 215
  });

  await handler({
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

  assert.deepEqual(db.records.rows[0].mediaList, [
    {
      mediaType: 'image',
      url: 'cloud://image-a',
      name: ''
    }
  ]);
});

test('record cloud function resolves media display urls for record detail', async () => {
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
  const handler = createRecordHandler({
    db,
    getOpenId: () => 'openid-a',
    getTempFileURL: (fileList) => Promise.resolve({
      fileList: fileList.map((fileID) => ({
        fileID,
        tempFileURL: 'https://tmp.example.com/image-detail.jpg'
      }))
    }),
    now: () => 225
  });

  const detailResult = await handler({
    action: 'getRecordDetail',
    payload: {
      id: 'record-1'
    }
  });

  assert.equal(detailResult.success, true);
  assert.equal(detailResult.data.record.mediaList[0].url, 'cloud://image-detail');
  assert.equal(
    detailResult.data.record.mediaList[0].displayUrl,
    'https://tmp.example.com/image-detail.jpg'
  );
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
