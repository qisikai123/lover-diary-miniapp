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
  createRecordComment,
  getRecordDetail,
  getRecordList,
  removeRecordComment,
  removeRecord,
  saveRecord,
  toggleRecordTop
};
