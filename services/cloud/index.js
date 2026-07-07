/**
 * 构建统一的云函数调用参数。
 *
 * 这样做是为了把 `action + payload` 协议固定下来，
 * 避免页面层直接散落云函数参数结构，后续调整时影响面过大。
 *
 * @param {string} name
 * @param {string} action
 * @param {Object} payload
 * @returns {{name: string, data: {action: string, payload: Object}}}
 */
function buildCloudFunctionPayload(name, action, payload) {
  return {
    name,
    data: {
      action,
      payload: payload || {}
    }
  };
}

/**
 * 调用微信云函数。
 *
 * 这里保留一个很薄的包装层，
 * 目的是把云开发 API 与业务服务解耦，后续切换入参或补统一错误处理时更容易收口。
 *
 * @param {string} name
 * @param {string} action
 * @param {Object} payload
 * @returns {Promise<any>}
 */
function callCloudFunction(name, action, payload) {
  const options = buildCloudFunctionPayload(name, action, payload);

  // 微信云开发是当前项目后端，优先走微信小程序运行时的 `wx.cloud`。
  if (typeof wx !== 'undefined' && wx.cloud) {
    return wx.cloud.callFunction(options).then((response) => {
      const result = response.result;

      if (result && result.success === false) {
        throw new Error(result.message || '云函数执行失败');
      }

      return result;
    }).catch((error) => {
      if (isMissingCloudFunctionError(error)) {
        throw new Error(`云函数 ${name} 未上传或未部署，请在微信开发者工具中上传部署后重试`);
      }

      throw error;
    });
  }

  return Promise.reject(new Error('当前运行环境不支持微信云开发调用'));
}

module.exports = {
  buildCloudFunctionPayload,
  callCloudFunction
};

function isMissingCloudFunctionError(error) {
  const message = error && (error.errMsg || error.message || String(error));

  return /FUNCTION_NOT_FOUND|-501000|FunctionName parameter could not be found/.test(message);
}
