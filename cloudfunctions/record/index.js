function createRecordHandler({ db, getOpenId, now }) {
  const records = db.collection('records');
  const getCurrentTime = now || (() => Date.now());

  return async function handleRecord(event) {
    try {
      const action = event.action || 'getRecordList';
      const payload = event.payload || {};

      if (action === 'getRecordList') {
        const response = await records.get();
        const list = filterRecords(response.data || [], payload);

        return success({
          list: sortRecords(list),
          total: list.length
        });
      }

      if (action === 'getRecordDetail') {
        const record = await getRecordById(records, payload.id);

        return success({
          record
        });
      }

      if (action === 'createRecord') {
        const createdAt = getCurrentTime();
        const record = {
          ...normalizeRecordPayload(payload),
          openid: getOpenId(),
          isTop: false,
          topAt: 0,
          createdAt,
          updatedAt: createdAt
        };
        const response = await records.add({
          data: record
        });

        return success({
          id: response._id,
          record: {
            ...record,
            _id: response._id
          }
        });
      }

      if (action === 'updateRecord') {
        const id = payload._id || payload.id;
        const updatedAt = getCurrentTime();
        const record = {
          ...normalizeRecordPayload(payload),
          updatedAt
        };

        await records.doc(id).update({
          data: record
        });

        return success({
          id,
          record: {
            ...record,
            _id: id
          }
        });
      }

      if (action === 'removeRecord') {
        const id = payload.id || payload._id;

        await records.doc(id).remove();

        return success({
          id
        });
      }

      if (action === 'toggleRecordTop') {
        const id = payload.id || payload._id;
        const isTop = Boolean(payload.isTop);
        const data = {
          isTop,
          topAt: isTop ? getCurrentTime() : 0,
          updatedAt: getCurrentTime()
        };

        await records.doc(id).update({
          data
        });

        return success({
          id,
          record: {
            _id: id,
            ...data
          }
        });
      }

      return {
        success: false,
        message: `未知记录操作：${action}`,
        data: {}
      };
    } catch (error) {
      if (isMissingRecordsCollectionError(error)) {
        return {
          success: false,
          message: '云数据库集合 records 未创建，请先在云开发数据库中创建 records 集合',
          data: {
            list: [],
            total: 0
          }
        };
      }

      throw error;
    }
  };
}

exports.main = async (event) => {
  const cloud = require('wx-server-sdk');

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  const handler = createRecordHandler({
    db: cloud.database(),
    getOpenId: () => {
      const context = cloud.getWXContext();

      return context.OPENID;
    },
    now: () => Date.now()
  });

  return handler(event || {});
};

exports.createRecordHandler = createRecordHandler;

function success(data) {
  return {
    success: true,
    data
  };
}

function isMissingRecordsCollectionError(error) {
  const message = error && (error.errMsg || error.message || String(error));

  return /DATABASE_COLLECTION_NOT_EXIST|collection not exists|Db or Table not exist: records|-502005/.test(message);
}

async function getRecordById(records, id) {
  if (!id) {
    return null;
  }

  const response = await records.doc(id).get();

  return response.data || null;
}

function normalizeRecordPayload(payload) {
  const mediaList = Array.isArray(payload.mediaList) ? payload.mediaList : [];

  return {
    content: typeof payload.content === 'string' ? payload.content.trim() : '',
    recordDate: payload.recordDate || '',
    recordType: inferRecordType(mediaList),
    mediaList
  };
}

function inferRecordType(mediaList) {
  if (!mediaList.length) {
    return 'text';
  }

  return mediaList[0].mediaType === 'video' ? 'video' : 'image';
}

function filterRecords(records, payload) {
  return records.filter((record) => {
    if (payload.startDate && record.recordDate < payload.startDate) {
      return false;
    }

    if (payload.endDate && record.recordDate > payload.endDate) {
      return false;
    }

    return true;
  });
}

function sortRecords(records) {
  return records.slice().sort((left, right) => {
    if (Boolean(left.isTop) !== Boolean(right.isTop)) {
      return left.isTop ? -1 : 1;
    }

    if (left.isTop && right.isTop) {
      return compareDesc(left.topAt, right.topAt);
    }

    const recordDateCompare = compareDesc(left.recordDate, right.recordDate);

    if (recordDateCompare !== 0) {
      return recordDateCompare;
    }

    return compareDesc(left.createdAt, right.createdAt);
  });
}

function compareDesc(left, right) {
  const leftValue = left || '';
  const rightValue = right || '';

  if (leftValue > rightValue) {
    return -1;
  }

  if (leftValue < rightValue) {
    return 1;
  }

  return 0;
}
