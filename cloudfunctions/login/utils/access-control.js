const NO_PERMISSION_MESSAGE = '无权限'
const ALLOWED_USER_OPENIDS = [
  'o3nkwxtkEEN8fIKzAKv_dHn81ul0',
  'o3nkwxpjNvJ6VEG4bO1noAFw9lC4',
]

/**
 * 判断 openid 是否允许进入小程序。
 *
 * 业务规则：
 * 空白名单仅用于单元测试和本地注入场景，生产入口必须传入明确白名单。
 *
 * @param {string} openid
 * @param {Array<string>} allowedOpenIds
 * @returns {Boolean}
 */
function isAllowedOpenId(openid, allowedOpenIds) {
  if (!Array.isArray(allowedOpenIds) || allowedOpenIds.length === 0) {
    return true
  }

  return allowedOpenIds.includes(openid)
}

module.exports = {
  ALLOWED_USER_OPENIDS,
  NO_PERMISSION_MESSAGE,
  isAllowedOpenId,
}
