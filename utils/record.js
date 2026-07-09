/**
 * 返回记录编辑页的默认表单。
 *
 * 约束：
 * 1. `recordType` 默认按纯文字处理
 * 2. `recordDate` 交给页面在加载时填入当天日期
 *
 * @returns {{content: string, recordDate: string, recordType: string, mediaList: Array}}
 */
function createEmptyRecordDraft() {
  return {
    content: '',
    recordDate: '',
    recordType: 'text',
    mediaList: []
  };
}

/**
 * 根据媒体列表推断记录类型。
 *
 * @param {Array<{mediaType: string}>} mediaList
 * @returns {'text'|'image'|'video'}
 */
function inferRecordType(mediaList) {
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    return 'text';
  }

  return mediaList[0].mediaType === 'video' ? 'video' : 'image';
}

/**
 * 计算记录列表筛选日期范围。
 *
 * 业务规则：
 * 1. 快捷筛选基于记录日期，而不是发布时间
 * 2. 最近3个月包含当前月，向前回溯两个月
 *
 * @param {{shortcut?: string, startDate?: string, endDate?: string}} filters
 * @param {Date} [baseDate]
 * @returns {{startDate: string, endDate: string}}
 */
function buildRecordDateRange(filters, baseDate) {
  const nextFilters = filters || {};
  const today = baseDate || new Date();

  if (nextFilters.shortcut === 'month') {
    return {
      startDate: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: formatDate(today)
    };
  }

  if (nextFilters.shortcut === 'quarter') {
    return {
      startDate: formatDate(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
      endDate: formatDate(today)
    };
  }

  return {
    startDate: nextFilters.startDate || '',
    endDate: nextFilters.endDate || ''
  };
}

/**
 * 规范化编辑页草稿，避免页面层和云函数对字段默认值理解不一致。
 *
 * @param {{_id?: string, content?: string, authorName?: string, recordDate?: string, recordType?: string, mediaList?: Array}} draft
 * @returns {{_id?: string, content: string, authorName?: string, recordDate: string, recordType: string, mediaList: Array}}
 */
function normalizeRecordDraft(draft) {
  const nextDraft = draft || {};
  const mediaList = Array.isArray(nextDraft.mediaList) ? nextDraft.mediaList : [];
  const normalizedDraft = {
    content: typeof nextDraft.content === 'string' ? nextDraft.content.trim() : '',
    recordDate: nextDraft.recordDate || '',
    recordType: inferRecordType(mediaList),
    mediaList: normalizePersistedMediaList(mediaList)
  };

  if (typeof nextDraft.authorName === 'string' && nextDraft.authorName.trim()) {
    normalizedDraft.authorName = nextDraft.authorName.trim();
  }

  if (nextDraft._id) {
    normalizedDraft._id = nextDraft._id;
  }

  return normalizedDraft;
}

/**
 * 按产品约定排序记录列表。
 *
 * @param {Array<{recordDate?: string, createdAt?: number, topAt?: number, isTop?: boolean}>} records
 * @returns {Array}
 */
function sortRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.slice().sort((left, right) => {
    if (left.isTop !== right.isTop) {
      return left.isTop ? -1 : 1;
    }

    if (left.isTop && right.isTop) {
      return compareDesc(left.topAt, right.topAt);
    }

    const recordDateCompare = compareDesc(left.recordDate, right.recordDate);

    if (recordDateCompare !== 0) {
      return recordDateCompare;
    }

    return compareDesc(left.createdAt, right.createdAt);
  });
}

/**
 * 校验记录草稿是否合法。
 *
 * 业务规则：
 * 1. 允许纯文字
 * 2. 图片和视频不能混发
 * 3. 图片最多 9 张，视频最多 1 个
 *
 * @param {{content?: string, mediaList?: Array<{mediaType: string}>}} draft
 * @returns {{valid: boolean, message: string}}
 */
function validateRecordDraft(draft) {
  const normalizedDraft = normalizeRecordDraft(draft);
  const mediaList = normalizedDraft.mediaList;
  const hasImage = mediaList.some((item) => item.mediaType === 'image');
  const hasVideo = mediaList.some((item) => item.mediaType === 'video');

  if (!normalizedDraft.content && mediaList.length === 0) {
    return {
      valid: false,
      message: '请写下内容或添加图片视频'
    };
  }

  if (!normalizedDraft.recordDate) {
    return {
      valid: false,
      message: '请选择记录日期'
    };
  }

  if (hasImage && hasVideo) {
    return {
      valid: false,
      message: '不能同时上传图片和视频'
    };
  }

  if (mediaList.filter((item) => item.mediaType === 'image').length > 9) {
    return {
      valid: false,
      message: '图片最多上传9张'
    };
  }

  if (mediaList.filter((item) => item.mediaType === 'video').length > 1) {
    return {
      valid: false,
      message: '视频最多上传1个'
    };
  }

  return {
    valid: true,
    message: ''
  };
}

module.exports = {
  buildRecordDateRange,
  createEmptyRecordDraft,
  inferRecordType,
  normalizeRecordDraft,
  sortRecords,
  validateRecordDraft
};

function normalizePersistedMediaList(mediaList) {
  return mediaList.map((item) => ({
    mediaType: item && item.mediaType ? item.mediaType : '',
    url: item && item.url ? item.url : '',
    name: item && item.name ? item.name : ''
  }));
}

function compareDesc(left, right) {
  const leftValue = left || '';
  const rightValue = right || '';

  if (leftValue > rightValue) {
    return -1;
  }

  if (leftValue < rightValue) {
    return 1;
  }

  return 0;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}
