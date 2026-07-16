const NO_PERMISSION_MESSAGE = '无权限';
const ALLOWED_USER_OPENIDS = [
  'o3nkwxtkEEN8fIKzAKv_dHn81ul0',
  'o3nkwxpjNvJ6VEG4bO1noAFw9lC4'
];

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
    return true;
  }

  return allowedOpenIds.includes(openid);
}

/**
 * 判断错误是否来自入口权限拦截。
 *
 * 业务规则：
 * 登录云函数返回“无权限”时，页面不应继续加载私密记录或进入编辑流程。
 *
 * @param {Error|Object|string} error
 * @returns {Boolean}
 */
function isAccessDeniedError(error) {
  const message = error && (error.message || error.errMsg || String(error));

  return message === NO_PERMISSION_MESSAGE;
}

/**
 * 展示入口权限失败弹框。
 *
 * 业务规则：
 * 无权限提示必须使用不可取消弹框，避免用户误以为只是普通加载失败。
 *
 * @param {Object} uniApi
 * @param {{complete?: Function}} [options]
 * @returns {void}
 */
function showNoPermissionModal(uniApi, options) {
  uniApi.showModal({
    title: NO_PERMISSION_MESSAGE,
    content: '当前账号无权限进入',
    showCancel: false,
    confirmText: '知道了',
    confirmColor: '#d27d56',
    complete: options && options.complete
  });
}

module.exports = {
  ALLOWED_USER_OPENIDS,
  NO_PERMISSION_MESSAGE,
  isAllowedOpenId,
  isAccessDeniedError,
  showNoPermissionModal
};
