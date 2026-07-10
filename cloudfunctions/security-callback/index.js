const crypto = require('crypto');

const CONTENT_VIOLATION_MESSAGE = '所发布内容含违规信息';

/**
 * 创建微信多媒体内容安全回调处理器。
 *
 * 单图结果独立落库，任务状态使用条件更新抢占最终发布，
 * 防止多图并发或微信重复投递造成记录重复创建。
 *
 * @param {{db: Object, now?: Function}} dependencies
 * @returns {Function}
 */
function createSecurityCallbackHandler({ db, now }) {
  const records = db.collection('records');
  const contentSecurityTasks = db.collection('content_security_tasks');
  const contentSecurityChecks = db.collection('content_security_checks');
  const getCurrentTime = now || (() => Date.now());

  return async function handleSecurityCallback(event) {
    const callback = normalizeCallbackEvent(event);

    if (!callback.traceId) {
      return success({
        ignored: true
      });
    }

    const check = await getById(contentSecurityChecks, callback.traceId);

    if (!check) {
      return success({
        ignored: true
      });
    }

    if (callback.suggestion !== 'pass') {
      await rejectReview({
        check,
        contentSecurityChecks,
        contentSecurityTasks,
        getCurrentTime
      });

      return success({
        reviewId: check.reviewId,
        status: 'rejected'
      });
    }

    if (check.status !== 'passed') {
      await contentSecurityChecks.doc(check._id).update({
        data: {
          status: 'passed',
          updatedAt: getCurrentTime()
        }
      });
    }

    const task = await getById(contentSecurityTasks, check.reviewId);

    if (!task || task.status === 'passed' || task.status === 'rejected') {
      return success({
        reviewId: check.reviewId,
        status: task ? task.status : 'ignored'
      });
    }

    const checksResponse = await contentSecurityChecks.where({
      reviewId: check.reviewId
    }).get();
    const checks = checksResponse.data || [];

    if (checks.some((item) => item.status === 'rejected')) {
      await rejectTask(contentSecurityTasks, task._id, getCurrentTime());

      return success({
        reviewId: task._id,
        status: 'rejected'
      });
    }

    if (
      checks.length !== task.checkCount
      || checks.some((item) => item.status !== 'passed')
    ) {
      return success({
        reviewId: task._id,
        status: 'pending'
      });
    }

    return finalizeReview({
      contentSecurityTasks,
      getCurrentTime,
      records,
      task
    });
  };
}

/**
 * 创建可通过 CloudBase HTTP 访问接收微信消息推送的入口。
 *
 * 微信多媒体审核结果不能使用普通云函数消息推送配置，
 * 因此公开 HTTP 入口必须校验 Token 签名后再处理回调。
 *
 * @param {{db: Object, now?: Function, callbackToken: string}} dependencies
 * @returns {Function}
 */
function createSecurityCallbackMain({ db, now, callbackToken }) {
  const handler = createSecurityCallbackHandler({
    db,
    now
  });

  return async function handleSecurityCallbackMain(event) {
    if (!isHttpRequest(event)) {
      return httpResponse(403, 'http callback required');
    }

    const query = event.queryStringParameters || event.query || {};

    if (!isValidWeChatSignature(query, callbackToken)) {
      return httpResponse(403, 'invalid signature');
    }

    if (getHttpMethod(event) === 'GET') {
      return httpResponse(200, query.echostr || '');
    }

    const body = parseHttpBody(event);
    await handler(body);

    return httpResponse(200, 'success');
  };
}

async function rejectReview({
  check,
  contentSecurityChecks,
  contentSecurityTasks,
  getCurrentTime
}) {
  if (check.status !== 'rejected') {
    await contentSecurityChecks.doc(check._id).update({
      data: {
        status: 'rejected',
        updatedAt: getCurrentTime()
      }
    });
  }

  const task = await getById(contentSecurityTasks, check.reviewId);

  if (task && task.status !== 'passed') {
    await rejectTask(contentSecurityTasks, task._id, getCurrentTime());
  }
}

async function rejectTask(contentSecurityTasks, reviewId, updatedAt) {
  await contentSecurityTasks.doc(reviewId).update({
    data: {
      status: 'rejected',
      message: CONTENT_VIOLATION_MESSAGE,
      updatedAt
    }
  });
}

async function finalizeReview({
  contentSecurityTasks,
  getCurrentTime,
  records,
  task
}) {
  const claimResponse = await contentSecurityTasks.where({
    _id: task._id,
    status: 'pending'
  }).update({
    data: {
      status: 'processing',
      updatedAt: getCurrentTime()
    }
  });

  if (!claimResponse.stats || claimResponse.stats.updated !== 1) {
    return success({
      reviewId: task._id,
      status: 'processing'
    });
  }

  try {
    const resultRecordId = await persistReviewedRecord(records, task);

    await contentSecurityTasks.doc(task._id).update({
      data: {
        status: 'passed',
        resultRecordId,
        message: '',
        updatedAt: getCurrentTime()
      }
    });

    return success({
      reviewId: task._id,
      status: 'passed',
      resultRecordId
    });
  } catch (error) {
    await contentSecurityTasks.doc(task._id).update({
      data: {
        status: 'pending',
        updatedAt: getCurrentTime()
      }
    });

    throw error;
  }
}

async function persistReviewedRecord(records, task) {
  if (task.operation === 'reviewMedia') {
    return '';
  }

  if (task.operation === 'updateRecord') {
    await records.doc(task.recordId).update({
      data: task.payload
    });

    return task.recordId;
  }

  const response = await records.add({
    data: task.payload
  });

  return response._id;
}

function normalizeCallbackEvent(event) {
  const source = event && event.body !== undefined ? event.body : event;

  if (typeof source === 'string') {
    return {
      traceId: readXmlTag(source, 'trace_id') || readXmlTag(source, 'traceId'),
      suggestion: readXmlTag(source, 'suggest')
    };
  }

  const payload = source && typeof source === 'object' ? source : {};

  return {
    traceId: payload.traceId || payload.trace_id || '',
    suggestion: getCallbackSuggestion(payload)
  };
}

function getCallbackSuggestion(payload) {
  if (payload.result && payload.result.suggest) {
    return payload.result.suggest;
  }

  if (payload.suggest) {
    return payload.suggest;
  }

  if (Array.isArray(payload.detail) && payload.detail.length) {
    return payload.detail.every((item) => item && item.suggest === 'pass')
      ? 'pass'
      : 'risky';
  }

  return '';
}

function readXmlTag(xml, tagName) {
  const expression = new RegExp(
    `<${tagName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tagName}>`,
    'i'
  );
  const match = expression.exec(xml);

  return match ? match[1].trim() : '';
}

function isHttpRequest(event) {
  return Boolean(
    event
    && (
      event.httpMethod
      || event.requestContext
      || event.queryStringParameters
      || event.query
    )
  );
}

function getHttpMethod(event) {
  const method = event.httpMethod
    || (event.requestContext && event.requestContext.httpMethod)
    || '';

  return method.toUpperCase();
}

function isValidWeChatSignature(query, callbackToken) {
  if (
    !callbackToken
    || !query
    || !query.signature
    || !query.timestamp
    || !query.nonce
  ) {
    return false;
  }

  const signature = [callbackToken, query.timestamp, query.nonce]
    .sort()
    .join('');
  const digest = crypto
    .createHash('sha1')
    .update(signature)
    .digest('hex');

  return digest === query.signature;
}

function parseHttpBody(event) {
  let body = event.body;

  if (event.isBase64Encoded && typeof body === 'string') {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  if (typeof body !== 'string') {
    return body || {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function httpResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8'
    },
    body
  };
}

async function getById(collection, id) {
  if (!id) {
    return null;
  }

  const response = await collection.doc(id).get();

  return response.data || null;
}

function success(data) {
  return {
    success: true,
    data
  };
}

exports.main = async (event) => {
  const cloud = require('wx-server-sdk');

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  const main = createSecurityCallbackMain({
    db: cloud.database(),
    callbackToken: process.env.SECURITY_CALLBACK_TOKEN,
    now: () => Date.now()
  });

  return main(event || {});
};

exports.createSecurityCallbackHandler = createSecurityCallbackHandler;
exports.createSecurityCallbackMain = createSecurityCallbackMain;
