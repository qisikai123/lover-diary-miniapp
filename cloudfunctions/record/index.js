const {
  ALLOWED_USER_OPENIDS,
  NO_PERMISSION_MESSAGE,
  isAllowedOpenId
} = require('../../utils/access-control');
const CONTENT_VIOLATION_MESSAGE = '所发布内容含违规信息';
const CONTENT_CHECK_FAILED_MESSAGE = '内容安全检测失败，请稍后重试';
const MEDIA_REVIEW_PENDING_MESSAGE = '图片正在审核，请稍后发布';
const MEDIA_URL_BATCH_SIZE = 50;

function createRecordHandler({
  db,
  getOpenId,
  now,
  getTempFileURL,
  downloadFile,
  checkText,
  checkMedia,
  allowedOpenIds
}) {
  const records = db.collection('records');
  const users = db.collection('users');
  const contentSecurityTasks = db.collection('content_security_tasks');
  const contentSecurityChecks = db.collection('content_security_checks');
  const getCurrentTime = now || (() => Date.now());
  const allowedUserOpenIds = Array.isArray(allowedOpenIds) ? allowedOpenIds : [];

  return async function handleRecord(event) {
    try {
      const action = event.action || 'getRecordList';
      const payload = event.payload || {};
      const openid = getOpenId();

      if (!isAllowedOpenId(openid, allowedUserOpenIds)) {
        return failure(NO_PERMISSION_MESSAGE);
      }

      if (action === 'getRecordList') {
        const response = await records.get();
        const list = sortRecords(
          filterRecords(response.data || [], payload).map(normalizeRecordForList)
        );

        return success({
          list,
          total: list.length
        });
      }

      if (action === 'getRecordDetail') {
        const record = await getRecordById(records, payload.id);

        return success({
          record
        });
      }

      if (action === 'getMediaDisplayUrls') {
        const response = await records.get();
        const accessibleFileIds = new Set(
          collectRecordMediaFileIds(response.data || [])
        );
        const fileIds = normalizeRequestedMediaFileIds(payload.fileList)
          .filter((fileId) => accessibleFileIds.has(fileId));
        const urlMap = await buildTempFileUrlMap(fileIds, getTempFileURL);

        // 双方记录需要共同展示，临时地址由云函数生成，避免客户端存储权限屏蔽对方图片。
        return success({
          fileList: fileIds
            .filter((fileId) => urlMap[fileId])
            .map((fileId) => ({
              fileID: fileId,
              tempFileURL: urlMap[fileId]
            }))
        });
      }

      if (action === 'getContentSecurityReview') {
        const reviewId = payload.reviewId || payload.id;
        const task = await getRecordById(contentSecurityTasks, reviewId);

        if (!task || task.openid !== getOpenId()) {
          return failure('审核任务不存在');
        }

        return success({
          reviewId,
          status: task.status,
          resultRecordId: task.resultRecordId || '',
          message: getReviewMessage(task)
        });
      }

      if (action === 'createMediaReview') {
        const openid = getOpenId();
        const media = normalizePersistedMediaList([payload.media])[0];
        const mediaReview = await prepareMediaReview({
          mediaList: media ? [media] : []
        }, downloadFile);

        if (mediaReview.failure) {
          return mediaReview.failure;
        }

        if (mediaReview.imageMedia.length !== 1) {
          return failure(CONTENT_CHECK_FAILED_MESSAGE);
        }

        return createPendingMediaReview({
          checkMedia,
          contentSecurityChecks,
          contentSecurityTasks,
          getCurrentTime,
          getTempFileURL,
          openid,
          operation: 'reviewMedia',
          payload: {
            mediaList: mediaReview.payload.mediaList
          },
          imageMedia: mediaReview.imageMedia,
          recordId: ''
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
        const contentFailure = await getTextContentFailure({
          checkText,
          content: record.content,
          openid
        });

        if (contentFailure) {
          return contentFailure;
        }

        const mediaReview = await prepareMediaReview(record, downloadFile);

        if (mediaReview.failure) {
          return mediaReview.failure;
        }

        if (mediaReview.imageMedia.length) {
          const reviewDecision = await getUploadReviewDecision({
            contentSecurityTasks,
            imageMedia: mediaReview.imageMedia,
            openid
          });

          if (reviewDecision === 'passed') {
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

          if (reviewDecision === 'pending') {
            return failure(MEDIA_REVIEW_PENDING_MESSAGE);
          }

          if (reviewDecision === 'rejected') {
            return failure(CONTENT_VIOLATION_MESSAGE);
          }

          if (reviewDecision === 'failed') {
            return failure(CONTENT_CHECK_FAILED_MESSAGE);
          }

          return createPendingMediaReview({
            checkMedia,
            contentSecurityChecks,
            contentSecurityTasks,
            getCurrentTime,
            getTempFileURL,
            openid,
            operation: action,
            payload: mediaReview.payload,
            imageMedia: mediaReview.imageMedia,
            recordId: ''
          });
        }

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
        const openid = getOpenId();
        const existingRecord = await getRecordById(records, id);

        if (!existingRecord) {
          return failure('记录不存在');
        }

        if (existingRecord.openid && existingRecord.openid !== openid) {
          return failure('只能编辑自己的记录');
        }

        const record = {
          ...normalizeRecordPayload(payload),
          updatedAt
        };
        const contentFailure = await getTextContentFailure({
          checkText,
          content: record.content,
          openid
        });

        if (contentFailure) {
          return contentFailure;
        }

        const mediaReview = await prepareMediaReview(record, downloadFile);

        if (mediaReview.failure) {
          return mediaReview.failure;
        }

        if (mediaReview.imageMedia.length) {
          const reviewDecision = await getUploadReviewDecision({
            contentSecurityTasks,
            imageMedia: mediaReview.imageMedia,
            openid
          });

          if (reviewDecision === 'passed') {
            await records.doc(id).update({
              data: record
            });

            return success({
              id,
              record: {
                ...existingRecord,
                ...record,
                _id: id
              }
            });
          }

          if (reviewDecision === 'pending') {
            return failure(MEDIA_REVIEW_PENDING_MESSAGE);
          }

          if (reviewDecision === 'rejected') {
            return failure(CONTENT_VIOLATION_MESSAGE);
          }

          if (reviewDecision === 'failed') {
            return failure(CONTENT_CHECK_FAILED_MESSAGE);
          }

          return createPendingMediaReview({
            checkMedia,
            contentSecurityChecks,
            contentSecurityTasks,
            getCurrentTime,
            getTempFileURL,
            openid,
            operation: action,
            payload: mediaReview.payload,
            imageMedia: mediaReview.imageMedia,
            recordId: id
          });
        }

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
          return failure('请输入评论内容');
        }

        const contentFailure = await getTextContentFailure({
          checkText,
          content,
          openid
        });

        if (contentFailure) {
          return contentFailure;
        }

        const record = await getRecordById(records, id);

        if (!record) {
          return failure('记录不存在');
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
          return failure('记录不存在');
        }

        const comments = normalizeComments(record.comments);
        const targetComment = comments.find((comment) => comment.id === commentId);

        if (!targetComment) {
          return failure('评论不存在');
        }

        if (targetComment.openid !== openid) {
          return failure('只能删除自己的评论');
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
    downloadFile: (fileID) => cloud.downloadFile({
      fileID
    }),
    checkText: (params) => cloud.openapi.security.msgSecCheck(params),
    checkMedia: (params) => cloud.openapi.security.mediaCheckAsync(params),
    getOpenId: () => {
      const context = cloud.getWXContext();

      return context.OPENID;
    },
    now: () => Date.now(),
    allowedOpenIds: ALLOWED_USER_OPENIDS
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

function failure(message) {
  return {
    success: false,
    message,
    data: {}
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

function getReviewMessage(task) {
  if (task.status === 'rejected') {
    return CONTENT_VIOLATION_MESSAGE;
  }

  if (task.status === 'failed') {
    return CONTENT_CHECK_FAILED_MESSAGE;
  }

  return task.message || '';
}

async function getTextContentFailure({ checkText, content, openid }) {
  if (!content) {
    return null;
  }

  if (typeof checkText !== 'function') {
    return failure(CONTENT_CHECK_FAILED_MESSAGE);
  }

  try {
    const response = await checkText({
      content,
      version: 2,
      scene: 4,
      openid
    });
    const suggestion = getSecuritySuggestion(response);

    if (suggestion === 'pass') {
      return null;
    }

    if (suggestion === 'risky' || suggestion === 'review') {
      return failure(CONTENT_VIOLATION_MESSAGE);
    }

    // 安全接口不可用或返回结构异常时必须拒绝发布，避免检测故障成为绕过通道。
    return failure(CONTENT_CHECK_FAILED_MESSAGE);
  } catch (error) {
    if (isRiskContentError(error)) {
      return failure(CONTENT_VIOLATION_MESSAGE);
    }

    return failure(CONTENT_CHECK_FAILED_MESSAGE);
  }
}

async function prepareMediaReview(payload, downloadFile) {
  if (!payload.mediaList.length) {
    return {
      payload,
      imageMedia: []
    };
  }

  const imageMedia = [];

  for (const item of payload.mediaList) {
    if (item.mediaType === 'image' || looksLikeImageFileId(item.url)) {
      imageMedia.push({
        ...item,
        mediaType: 'image'
      });
      continue;
    }

    if (!isCloudFileId(item.url) || typeof downloadFile !== 'function') {
      return {
        failure: failure(CONTENT_CHECK_FAILED_MESSAGE),
        imageMedia: []
      };
    }

    try {
      const response = await downloadFile(item.url);
      const fileContent = response && response.fileContent
        ? response.fileContent
        : response;

      // 客户端可伪造 mediaType，服务端需按文件头识别图片以防绕过审核。
      if (isImageBuffer(fileContent)) {
        imageMedia.push({
          ...item,
          mediaType: 'image'
        });
      }
    } catch (error) {
      return {
        failure: failure(CONTENT_CHECK_FAILED_MESSAGE),
        imageMedia: []
      };
    }
  }

  if (imageMedia.length && imageMedia.length !== payload.mediaList.length) {
    return {
      failure: failure('不能同时上传图片和视频'),
      imageMedia: []
    };
  }

  if (!imageMedia.length) {
    return {
      payload,
      imageMedia: []
    };
  }

  return {
    payload: {
      ...payload,
      recordType: 'image',
      mediaList: imageMedia
    },
    imageMedia
  };
}

function looksLikeImageFileId(fileId) {
  return /\/records\/images\//.test(fileId)
    || /\.(?:jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif)$/i.test(fileId);
}

function isImageBuffer(fileContent) {
  if (!Buffer.isBuffer(fileContent) || fileContent.length < 4) {
    return false;
  }

  if (
    fileContent[0] === 0xff
    && fileContent[1] === 0xd8
    && fileContent[2] === 0xff
  ) {
    return true;
  }

  const signature = fileContent.toString('ascii', 0, 12);

  return fileContent.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )
    || signature.startsWith('GIF87a')
    || signature.startsWith('GIF89a')
    || (
      signature.startsWith('RIFF')
      && signature.slice(8, 12) === 'WEBP'
    )
    || signature.startsWith('BM')
    || (
      signature.slice(4, 8) === 'ftyp'
      && [
        'heic',
        'heix',
        'hevc',
        'hevx',
        'heim',
        'heis',
        'mif1',
        'msf1',
        'avif',
        'avis'
      ].includes(signature.slice(8, 12))
    );
}

async function createPendingMediaReview({
  checkMedia,
  contentSecurityChecks,
  contentSecurityTasks,
  getCurrentTime,
  getTempFileURL,
  openid,
  operation,
  payload,
  imageMedia,
  recordId
}) {
  if (typeof checkMedia !== 'function' || typeof getTempFileURL !== 'function') {
    return failure(CONTENT_CHECK_FAILED_MESSAGE);
  }

  const fileIds = imageMedia.map((item) => item.url);

  if (fileIds.some((fileId) => !isCloudFileId(fileId))) {
    return failure(CONTENT_CHECK_FAILED_MESSAGE);
  }

  let reviewId = '';

  try {
    const createdAt = getCurrentTime();
    const [tempFileUrlMap, taskResponse] = await Promise.all([
      buildTempFileUrlMap(fileIds, getTempFileURL),
      contentSecurityTasks.add({
        data: {
          openid,
          operation,
          recordId,
          payload,
          status: 'pending',
          checkCount: imageMedia.length,
          resultRecordId: '',
          message: '',
          createdAt,
          updatedAt: createdAt
        }
      })
    ]);
    reviewId = taskResponse._id;

    if (fileIds.some((fileId) => !tempFileUrlMap[fileId])) {
      throw new Error('temporary media URL is unavailable');
    }

    const mediaChecks = await Promise.all(imageMedia.map(async (item) => {
      const mediaCheckParams = {
        mediaUrl: tempFileUrlMap[item.url],
        mediaType: 2,
        version: 2,
        scene: 4,
        openid
      };

      const response = await checkMedia(mediaCheckParams);
      const traceId = getMediaTraceId(response);

      if (!traceId || isOpenApiFailure(response)) {
        throw createMediaCheckError(response);
      }

      return {
        traceId,
        fileId: item.url
      };
    }));

    await Promise.all(mediaChecks.map((check) => (
      contentSecurityChecks.add({
        data: {
          _id: check.traceId,
          reviewId,
          fileId: check.fileId,
          status: 'pending',
          createdAt,
          updatedAt: createdAt
        }
      })
    )));

    return success({
      pendingReview: true,
      reviewId
    });
  } catch (error) {
    if (reviewId) {
      await contentSecurityTasks.doc(reviewId).update({
        data: {
          status: 'failed',
          message: CONTENT_CHECK_FAILED_MESSAGE,
          updatedAt: getCurrentTime()
        }
      });
    }

    if (isRiskContentError(error)) {
      return failure(CONTENT_VIOLATION_MESSAGE);
    }

    return failure(CONTENT_CHECK_FAILED_MESSAGE);
  }
}

function createMediaCheckError(response) {
  const error = new Error(
    getErrorMessage(response) || 'media security check did not return a trace id'
  );
  error.errCode = getOpenApiErrorCode(response);

  return error;
}

function getSecuritySuggestion(response) {
  if (response && response.result && response.result.suggest) {
    return response.result.suggest;
  }

  return response && response.suggest ? response.suggest : '';
}

function getMediaTraceId(response) {
  if (!response) {
    return '';
  }

  if (response.traceId || response.trace_id) {
    return response.traceId || response.trace_id;
  }

  if (response.result) {
    return response.result.traceId || response.result.trace_id || '';
  }

  return '';
}

function isOpenApiFailure(response) {
  const errorCode = getOpenApiErrorCode(response);

  return Boolean(errorCode);
}

function isRiskContentError(error) {
  const errorCode = getOpenApiErrorCode(error);

  return Number(errorCode) === 87014;
}

function getOpenApiErrorCode(source) {
  return source && (source.errCode || source.errcode) || '';
}

function getErrorMessage(source) {
  return source && (
    source.errMsg
    || source.errmsg
    || source.message
  ) || '';
}

async function getUploadReviewDecision({
  contentSecurityTasks,
  imageMedia,
  openid
}) {
  if (imageMedia.some((item) => !item.reviewId)) {
    return 'missing';
  }

  const tasks = await Promise.all(
    imageMedia.map((item) => getRecordById(
      contentSecurityTasks,
      item.reviewId
    ))
  );

  if (tasks.some((task, index) => !isUploadReviewForMedia(
    task,
    imageMedia[index],
    openid
  ))) {
    return 'missing';
  }

  if (tasks.some((task) => task.status === 'rejected')) {
    return 'rejected';
  }

  if (tasks.some((task) => task.status === 'failed')) {
    return 'failed';
  }

  if (tasks.some((task) => task.status !== 'passed')) {
    return 'pending';
  }

  return 'passed';
}

function isUploadReviewForMedia(task, media, openid) {
  const mediaList = task && task.payload && Array.isArray(task.payload.mediaList)
    ? task.payload.mediaList
    : [];

  return Boolean(
    task
    && task.openid === openid
    && task.operation === 'reviewMedia'
    && mediaList.some((item) => item && item.url === media.url)
  );
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
  return mediaList.map((item) => {
    const media = {
      mediaType: item && item.mediaType ? item.mediaType : '',
      url: item && item.url ? item.url : '',
      name: item && item.name ? item.name : ''
    };

    if (item && item.reviewId) {
      media.reviewId = item.reviewId;
    }

    return media;
  });
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

function normalizeRequestedMediaFileIds(fileList) {
  return Array.from(new Set(
    (Array.isArray(fileList) ? fileList : [])
      .filter((fileId) => typeof fileId === 'string' && isCloudFileId(fileId))
  )).slice(0, MEDIA_URL_BATCH_SIZE);
}

function collectRecordMediaFileIds(records) {
  return Array.from(new Set(
    records
      .flatMap((record) => (
        record && Array.isArray(record.mediaList) ? record.mediaList : []
      ))
      .map((media) => (media && media.url ? media.url : ''))
      .filter(isCloudFileId)
  ));
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
