function createRecordHandler({ db, getOpenId, now, getTempFileURL }) {
  const records = db.collection('records');
  const users = db.collection('users');
  const getCurrentTime = now || (() => Date.now());

  return async function handleRecord(event) {
    try {
      const action = event.action || 'getRecordList';
      const payload = event.payload || {};

      if (action === 'getRecordList') {
        const response = await records.get();
        const list = filterRecords(response.data || [], payload).map(normalizeRecordForList);
        const recordsWithDisplayUrls = await resolveRecordsMediaDisplayUrls(
          sortRecords(list),
          getTempFileURL
        );

        return success({
          list: recordsWithDisplayUrls,
          total: list.length
        });
      }

      if (action === 'getRecordDetail') {
        const record = await getRecordById(records, payload.id);

        return success({
          record: await resolveRecordMediaDisplayUrls(record, getTempFileURL)
        });
      }

      if (action === 'createRecord') {
        const createdAt = getCurrentTime();
        const openid = getOpenId();
        const record = {
          ...normalizeRecordPayload(payload, {
            authorName: await resolveAuthorName({
              payload,
              users,
              openid
            })
          }),
          openid,
          comments: [],
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

      if (action === 'createComment' || action === 'createRecordComment') {
        const id = payload.recordId || payload.id || payload._id;
        const openid = getOpenId();
        const createdAt = getCurrentTime();
        const content = normalizeCommentContent(payload.content);

        if (!content) {
          return {
            success: false,
            message: '请输入评论内容',
            data: {}
          };
        }

        const record = await getRecordById(records, id);

        if (!record) {
          return {
            success: false,
            message: '记录不存在',
            data: {}
          };
        }

        const existingComments = normalizeComments(record.comments);
        const comment = {
          id: createCommentId(openid, createdAt, existingComments.length),
          openid,
          authorName: await resolveAuthorName({
            payload,
            users,
            openid
          }),
          content,
          createdAt
        };
        const comments = existingComments.concat(comment);

        await records.doc(id).update({
          data: {
            comments,
            updatedAt: createdAt
          }
        });

        return success({
          id,
          comment,
          comments
        });
      }

      if (action === 'removeComment' || action === 'removeRecordComment') {
        const id = payload.recordId || payload.id || payload._id;
        const commentId = payload.commentId;
        const openid = getOpenId();
        const updatedAt = getCurrentTime();
        const record = await getRecordById(records, id);

        if (!record) {
          return {
            success: false,
            message: '记录不存在',
            data: {}
          };
        }

        const comments = normalizeComments(record.comments);
        const targetComment = comments.find((comment) => comment.id === commentId);

        if (!targetComment) {
          return {
            success: false,
            message: '评论不存在',
            data: {}
          };
        }

        if (targetComment.openid !== openid) {
          return {
            success: false,
            message: '只能删除自己的评论',
            data: {}
          };
        }

        const nextComments = comments.filter((comment) => comment.id !== commentId);

        await records.doc(id).update({
          data: {
            comments: nextComments,
            updatedAt
          }
        });

        return success({
          id,
          commentId,
          comments: nextComments
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
    getTempFileURL: (fileList) => cloud.getTempFileURL({
      fileList
    }),
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

function normalizeRecordPayload(payload, options) {
  const mediaList = Array.isArray(payload.mediaList) ? payload.mediaList : [];
  const normalizedPayload = {
    content: typeof payload.content === 'string' ? payload.content.trim() : '',
    recordDate: payload.recordDate || '',
    recordType: inferRecordType(mediaList),
    mediaList: normalizePersistedMediaList(mediaList)
  };

  if (options && options.authorName) {
    normalizedPayload.authorName = options.authorName;
  }

  return normalizedPayload;
}

async function resolveAuthorName({ payload, users, openid }) {
  if (typeof payload.authorName === 'string' && payload.authorName.trim()) {
    return payload.authorName.trim();
  }

  const response = await users.where({
    openid
  }).get();
  const user = (response.data || [])[0];

  if (user && typeof user.nickname === 'string' && user.nickname.trim()) {
    return user.nickname.trim();
  }

  return '微信用户';
}

function inferRecordType(mediaList) {
  if (!mediaList.length) {
    return 'text';
  }

  return mediaList[0].mediaType === 'video' ? 'video' : 'image';
}

function normalizePersistedMediaList(mediaList) {
  return mediaList.map((item) => ({
    mediaType: item && item.mediaType ? item.mediaType : '',
    url: item && item.url ? item.url : '',
    name: item && item.name ? item.name : ''
  }));
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

function normalizeRecordForList(record) {
  return {
    ...record,
    comments: normalizeComments(record.comments),
    authorName: typeof record.authorName === 'string' && record.authorName.trim()
      ? record.authorName.trim()
      : '我们'
  };
}

async function resolveRecordsMediaDisplayUrls(records, getTempFileURL) {
  if (!Array.isArray(records) || !records.length) {
    return [];
  }

  const urlMap = await buildTempFileUrlMap(
    collectCloudFileIdsFromRecords(records),
    getTempFileURL
  );

  return records.map((record) => ({
    ...record,
    mediaList: resolveMediaDisplayUrls(record.mediaList, urlMap)
  }));
}

async function resolveRecordMediaDisplayUrls(record, getTempFileURL) {
  if (!record) {
    return record;
  }

  const urlMap = await buildTempFileUrlMap(
    collectCloudFileIdsFromRecords([record]),
    getTempFileURL
  );

  return {
    ...record,
    mediaList: resolveMediaDisplayUrls(record.mediaList, urlMap)
  };
}

async function buildTempFileUrlMap(fileIDs, getTempFileURL) {
  if (!fileIDs.length || typeof getTempFileURL !== 'function') {
    return {};
  }

  const response = await getTempFileURL(fileIDs);
  const fileList = response && Array.isArray(response.fileList)
    ? response.fileList
    : [];

  return fileList.reduce((urlMap, file) => {
    if (file && file.fileID && file.tempFileURL) {
      urlMap[file.fileID] = file.tempFileURL;
    }

    return urlMap;
  }, {});
}

function collectCloudFileIdsFromRecords(records) {
  return Array.from(
    new Set(
      records
        .flatMap((record) => (Array.isArray(record.mediaList) ? record.mediaList : []))
        .map((item) => (item && typeof item.url === 'string' ? item.url : ''))
        .filter(isCloudFileId)
    )
  );
}

function resolveMediaDisplayUrls(mediaList, urlMap) {
  if (!Array.isArray(mediaList)) {
    return [];
  }

  return mediaList.map((item) => {
    const url = item && item.url ? item.url : '';

    return {
      ...item,
      displayUrl: urlMap[url] || item.displayUrl || (isCloudFileId(url) ? '' : url)
    };
  });
}

function normalizeComments(comments) {
  if (!Array.isArray(comments)) {
    return [];
  }

  return comments
    .filter((comment) => comment && comment.id)
    .map((comment) => ({
      id: comment.id,
      openid: comment.openid || '',
      authorName: typeof comment.authorName === 'string' && comment.authorName.trim()
        ? comment.authorName.trim()
        : '微信用户',
      content: normalizeCommentContent(comment.content),
      createdAt: comment.createdAt || 0
    }));
}

function normalizeCommentContent(content) {
  return typeof content === 'string' ? content.trim() : '';
}

function createCommentId(openid, createdAt, index) {
  return `comment-${createdAt}-${index}-${String(openid || 'user').slice(-8)}`;
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

function isCloudFileId(url) {
  return /^cloud:\/\//.test(url);
}
