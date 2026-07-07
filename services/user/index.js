const { callCloudFunction } = require('../cloud/index');

/**
 * 登录并返回当前微信用户资料。
 *
 * 登录阶段只负责识别和保存用户信息，权限校验会在后续空间/成员功能中收口。
 *
 * @param {{nickname?: string, nickName?: string, avatarUrl?: string, birthDate?: string}} payload
 * @returns {Promise<any>}
 */
function login(payload) {
  return callCloudFunction('login', 'login', payload);
}

/**
 * 更新当前用户可编辑资料。
 *
 * @param {{nickname: string, avatarUrl?: string, birthDate?: string}} payload
 * @returns {Promise<any>}
 */
function updateUserProfile(payload) {
  return callCloudFunction('login', 'updateUserProfile', payload);
}

module.exports = {
  login,
  updateUserProfile
};
