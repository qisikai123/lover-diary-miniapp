const TERMINAL_REVIEW_STATUSES = ['passed', 'rejected', 'failed'];

/**
 * 等待上传图片的内容安全审核结果。
 *
 * 业务规则：
 * 1. 图片仅在审核通过后返回给页面展示
 * 2. 违规、检测失败或轮询超时均不得返回图片
 * 3. 审核任务 ID 必须随通过图片保存，供发布时服务端复核
 *
 * @param {Object} options
 * @param {Object} options.media
 * @param {Function} options.createReview
 * @param {Function} options.getReview
 * @param {Function} [options.delay]
 * @param {number} [options.maxAttempts]
 * @param {number} [options.interval]
 * @returns {Promise<{status: string, media: Object|null, reviewId: string}>}
 */
async function reviewUploadedImage(options) {
  const {
    media,
    createReview,
    getReview,
    delay = wait,
    maxAttempts = 15,
    interval = 2000
  } = options;
  const response = await createReview({
    media
  });
  const reviewData = response && response.data ? response.data : {};
  const reviewId = reviewData.reviewId || '';

  if (!reviewId) {
    throw new Error('图片审核任务创建失败');
  }

  const review = await pollReview({
    reviewId,
    getReview,
    delay,
    maxAttempts,
    interval
  });
  const status = review ? review.status : 'pending';

  return {
    status,
    media: status === 'passed'
      ? {
        ...media,
        reviewId
      }
      : null,
    reviewId
  };
}

async function pollReview({
  reviewId,
  getReview,
  delay,
  maxAttempts,
  interval
}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await getReview({
      reviewId
    });
    const review = response && response.data ? response.data : {};

    if (TERMINAL_REVIEW_STATUSES.includes(review.status)) {
      return review;
    }

    if (attempt < maxAttempts - 1) {
      await delay(interval);
    }
  }

  return null;
}

function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

module.exports = {
  reviewUploadedImage
};
