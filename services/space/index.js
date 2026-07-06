const { callCloudFunction } = require('../cloud/index');

/**
 * 获取情侣空间资料。
 *
 * @returns {Promise<any>}
 */
function getSpaceProfile() {
  return callCloudFunction('space', 'getSpaceProfile', {});
}

module.exports = {
  getSpaceProfile
};
