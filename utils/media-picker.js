/**
 * 选择发布记录使用的本地媒体文件。
 *
 * 业务约束：
 * 1. 分图片/视频入口优先沿用 chooseImage / chooseVideo
 * 2. 旧接口不存在时再使用 chooseMedia 兜底
 * 3. 用户主动取消不视为错误，避免误弹失败提示
 *
 * @param {{mediaType: 'image'|'video', count?: number, uniApi?: Object}} options
 * @returns {Promise<Array<{path: string, mediaType: string, name?: string}>>}
 */
function chooseRecordMedia(options) {
  const nextOptions = options || {}
  const mediaType = nextOptions.mediaType
  const count = nextOptions.count || 1
  const uniApi = nextOptions.uniApi || (typeof uni !== 'undefined' ? uni : null)

  if (!uniApi) {
    return Promise.reject(new Error('当前环境不支持媒体选择'))
  }

  if (mediaType === 'image' && typeof uniApi.chooseImage === 'function') {
    return chooseImageWithLegacyApi({
      uniApi,
      count,
    })
  }

  if (mediaType === 'video' && typeof uniApi.chooseVideo === 'function') {
    return chooseVideoWithLegacyApi({
      uniApi,
    })
  }

  if (typeof uniApi.chooseMedia === 'function') {
    return chooseMediaWithCurrentApi({
      uniApi,
      mediaType,
      count,
    })
  }

  return Promise.reject(new Error('当前环境不支持媒体选择'))
}

/**
 * 判断媒体选择失败是否来自用户主动取消。
 *
 * @param {{errMsg?: string, errCode?: number}|null} error
 * @returns {boolean}
 */
function isMediaChooseCancel(error) {
  const errMsg = error && error.errMsg ? error.errMsg : ''

  return /cancel/i.test(errMsg)
}

/**
 * 生成媒体选择失败时给用户看的提示。
 *
 * @param {{errMsg?: string}|null} error
 * @param {'image'|'video'} [mediaType]
 * @returns {string}
 */
function getMediaChooseFailureMessage(error, mediaType) {
  const errMsg = error && error.errMsg ? error.errMsg : ''

  if (/privacy|scope/i.test(errMsg)) {
    return '请完善小程序隐私协议配置'
  }

  return mediaType === 'video' ? '视频选择失败，请重试' : '图片选择失败，请重试'
}

function chooseMediaWithCurrentApi({ uniApi, mediaType, count }) {
  return new Promise((resolve, reject) => {
    const request = {
      count,
      mediaType: [mediaType],
      sourceType: ['album', 'camera'],
      success: (result) => {
        resolve(normalizeChosenMediaFiles(result, mediaType))
      },
      fail: (error) => {
        handleChooseFailure({
          error,
          mediaType,
          resolve,
          reject,
        })
      },
    }

    if (mediaType === 'image') {
      request.sizeType = ['compressed']
    }

    if (mediaType === 'video') {
      request.maxDuration = 60
    }

    uniApi.chooseMedia(request)
  })
}

function chooseImageWithLegacyApi({ uniApi, count }) {
  return new Promise((resolve, reject) => {
    uniApi.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const tempFilePaths = Array.isArray(result.tempFilePaths)
          ? result.tempFilePaths
          : []

        resolve(
          tempFilePaths.map((path) => ({
            path,
            mediaType: 'image',
          }))
        )
      },
      fail: (error) => {
        handleChooseFailure({
          error,
          mediaType: 'image',
          resolve,
          reject,
        })
      },
    })
  })
}

function chooseVideoWithLegacyApi({ uniApi }) {
  return new Promise((resolve, reject) => {
    uniApi.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      maxDuration: 60,
      success: (result) => {
        resolve([
          {
            path: result.tempFilePath,
            mediaType: 'video',
            name: '视频',
          },
        ])
      },
      fail: (error) => {
        handleChooseFailure({
          error,
          mediaType: 'video',
          resolve,
          reject,
        })
      },
    })
  })
}

function handleChooseFailure({ error, mediaType, resolve, reject }) {
  if (isMediaChooseCancel(error)) {
    resolve([])
    return
  }

  reject(new Error(getMediaChooseFailureMessage(error, mediaType)))
}

function normalizeChosenMediaFiles(result, fallbackMediaType) {
  const tempFiles = Array.isArray(result && result.tempFiles)
    ? result.tempFiles
    : []

  return tempFiles
    .map((file) => {
      const mediaType = file.fileType || file.type || fallbackMediaType
      const path = file.tempFilePath || file.path || ''

      if (!path) {
        return null
      }

      return {
        path,
        mediaType,
        name: mediaType === 'video' ? '视频' : undefined,
      }
    })
    .filter(Boolean)
    .map((file) => {
      if (file.name) {
        return file
      }

      return {
        path: file.path,
        mediaType: file.mediaType,
      }
    })
}

module.exports = {
  chooseRecordMedia,
  getMediaChooseFailureMessage,
  isMediaChooseCancel,
}
