const { callCloudFunction } = require('../cloud/index');

/**
 * 登录并返回当前微信用户资料。
 *
 * 登录云函数会同时完成入口白名单校验，避免页面层自行判断 openid。
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
