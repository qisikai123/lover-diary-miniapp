const { callCloudFunction } = require('../cloud/index');

/**
 * 获取记录列表。
 *
 * @param {{page?: number, pageSize?: number, startDate?: string, endDate?: string}} payload
 * @returns {Promise<any>}
 */
function getRecordList(payload) {
  return callCloudFunction('record', 'getRecordList', payload);
}

/**
 * 获取单条记录详情。
 *
 * @param {{id: string}} payload
 * @returns {Promise<any>}
 */
function getRecordDetail(payload) {
  return callCloudFunction('record', 'getRecordDetail', payload);
}

/**
 * 通过云函数权限解析记录媒体的临时访问地址。
 *
 * @param {Array<string>} fileList
 * @returns {Promise<{fileList: Array<Object>}>}
 */
function getMediaDisplayUrls(fileList) {
  return callCloudFunction('record', 'getMediaDisplayUrls', {
    fileList
  }).then((response) => ({
    fileList:
      response && response.data && Array.isArray(response.data.fileList)
        ? response.data.fileList
        : []
  }));
}

/**
 * 查询记录内容安全审核状态。
 *
 * @param {{reviewId: string}} payload
 * @returns {Promise<any>}
 */
function getContentSecurityReview(payload) {
  return callCloudFunction('record', 'getContentSecurityReview', payload);
}

/**
 * 图片上传后立即创建异步内容安全审核任务。
 *
 * @param {{media: Object}} payload
 * @returns {Promise<any>}
 */
function createMediaReview(payload) {
  return callCloudFunction('record', 'createMediaReview', payload);
}

/**
 * 保存记录。
 *
 * @param {Object} payload
 * @returns {Promise<any>}
 */
function saveRecord(payload) {
  return callCloudFunction('record', payload && payload._id ? 'updateRecord' : 'createRecord', payload);
}

/**
 * 删除记录。
 *
 * @param {{id: string}} payload
 * @returns {Promise<any>}
 */
function removeRecord(payload) {
  return callCloudFunction('record', 'removeRecord', payload);
}

/**
 * 切换记录置顶状态。
 *
 * @param {{id: string, isTop: boolean}} payload
 * @returns {Promise<any>}
 */
function toggleRecordTop(payload) {
  return callCloudFunction('record', 'toggleRecordTop', payload);
}

/**
 * 新增记录评论。
 *
 * @param {{recordId: string, content: string}} payload
 * @returns {Promise<any>}
 */
function createRecordComment(payload) {
  return callCloudFunction('record', 'createComment', payload);
}

/**
 * 删除记录评论。
 *
 * @param {{recordId: string, commentId: string}} payload
 * @returns {Promise<any>}
 */
function removeRecordComment(payload) {
  return callCloudFunction('record', 'removeComment', payload);
}

module.exports = {
  createMediaReview,
  createRecordComment,
  getContentSecurityReview,
  getMediaDisplayUrls,
  getRecordDetail,
  getRecordList,
  removeRecordComment,
  removeRecord,
  saveRecord,
  toggleRecordTop
};
