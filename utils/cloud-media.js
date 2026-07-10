const TEMP_URL_BATCH_SIZE = 50;

/**
 * 在客户端为记录列表补充媒体临时访问地址。
 *
 * 临时地址解析失败时仍返回记录数据，避免云存储波动阻塞列表加载。
 *
 * @param {Array<{mediaList?: Array}>} records
 * @param {Function} [getTempFileURL]
 * @returns {Promise<Array>}
 */
async function resolveRecordsMediaDisplayUrls(records, getTempFileURL) {
  const source = Array.isArray(records) ? records : [];
  const fileIDs = collectCloudFileIDs(source);
  let urlMap = {};

  if (fileIDs.length) {
    try {
      urlMap = await resolveTempFileUrlMap(
        fileIDs,
        getTempFileURL || getDefaultTempFileURL
      );
    } catch (error) {
      console.warn('Cloud media URL resolution failed', {
        fileCount: fileIDs.length,
        errMsg: error && error.message ? error.message : ''
      });
    }
  }

  return source.map((record) => ({
    ...record,
    mediaList: resolveMediaList(record && record.mediaList, urlMap)
  }));
}

/**
 * 在客户端为单条记录补充媒体临时访问地址。
 *
 * @param {{mediaList?: Array}|null} record
 * @param {Function} [getTempFileURL]
 * @returns {Promise<Object|null>}
 */
async function resolveRecordMediaDisplayUrls(record, getTempFileURL) {
  if (!record) {
    return record;
  }

  const records = await resolveRecordsMediaDisplayUrls(
    [record],
    getTempFileURL
  );

  return records[0];
}

async function resolveTempFileUrlMap(fileIDs, getTempFileURL) {
  const batches = [];

  for (let index = 0; index < fileIDs.length; index += TEMP_URL_BATCH_SIZE) {
    batches.push(fileIDs.slice(index, index + TEMP_URL_BATCH_SIZE));
  }

  const responses = await Promise.all(
    batches.map((fileList) => getTempFileURL(fileList))
  );

  return responses
    .flatMap((response) => (
      response && Array.isArray(response.fileList) ? response.fileList : []
    ))
    .reduce((map, file) => {
      if (file && file.fileID && file.tempFileURL) {
        map[file.fileID] = file.tempFileURL;
      }

      return map;
    }, {});
}

function getDefaultTempFileURL(fileList) {
  if (
    typeof wx === 'undefined'
    || !wx.cloud
    || typeof wx.cloud.getTempFileURL !== 'function'
  ) {
    return Promise.resolve({
      fileList: []
    });
  }

  return wx.cloud.getTempFileURL({
    fileList
  });
}

function collectCloudFileIDs(records) {
  return Array.from(new Set(
    records
      .flatMap((record) => (
        record && Array.isArray(record.mediaList) ? record.mediaList : []
      ))
      .map((item) => (item && typeof item.url === 'string' ? item.url : ''))
      .filter((url) => /^cloud:\/\//.test(url))
  ));
}

function resolveMediaList(mediaList, urlMap) {
  if (!Array.isArray(mediaList)) {
    return [];
  }

  return mediaList.map((item) => {
    const url = item && item.url ? item.url : '';

    return {
      ...item,
      displayUrl: urlMap[url]
        || item.displayUrl
        || (/^cloud:\/\//.test(url) ? '' : url)
    };
  });
}

module.exports = {
  resolveRecordMediaDisplayUrls,
  resolveRecordsMediaDisplayUrls
};
