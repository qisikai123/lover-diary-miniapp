const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecordHandler
} = require('../../cloudfunctions/record/index');

function createMemoryCollection(initialRecords) {
  const rows = (initialRecords || []).map((item) => ({ ...item }));

  return {
    rows,
    get() {
      return Promise.resolve({
        data: rows.slice()
      });
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

function createMemoryDb(initialRecords) {
  const records = createMemoryCollection(initialRecords);

  return {
    records,
    collection(name) {
      assert.equal(name, 'records');
      return records;
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
      recordDate: '2026-07-06',
      recordType: 'text',
      mediaList: []
    }
  });

  assert.equal(createResult.success, true);
  assert.equal(db.records.rows[0].openid, 'openid-a');

  const listResult = await handler({
    action: 'getRecordList',
    payload: {}
  });

  assert.deepEqual(listResult.data.list.map((item) => item.content), ['first day']);
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
