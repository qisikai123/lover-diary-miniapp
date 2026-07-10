const test = require('node:test');
const assert = require('node:assert/strict');

const {
  reviewUploadedImage
} = require('../../utils/media-review');

test('uploaded image becomes displayable only after its review passes', async () => {
  const reviewedImage = {
    mediaType: 'image',
    url: 'cloud://approved-image',
    name: 'approved.jpg'
  };
  const reviewResponses = [
    {
      data: {
        status: 'pending'
      }
    },
    {
      data: {
        status: 'passed'
      }
    }
  ];
  const delays = [];

  const result = await reviewUploadedImage({
    media: reviewedImage,
    createReview: () => Promise.resolve({
      data: {
        reviewId: 'review-approved'
      }
    }),
    getReview: () => Promise.resolve(reviewResponses.shift()),
    delay: (duration) => {
      delays.push(duration);
      return Promise.resolve();
    },
    interval: 20
  });

  assert.equal(result.status, 'passed');
  assert.deepEqual(result.media, {
    ...reviewedImage,
    reviewId: 'review-approved'
  });
  assert.deepEqual(delays, [20]);
});

test('rejected uploaded image is not returned for display', async () => {
  const result = await reviewUploadedImage({
    media: {
      mediaType: 'image',
      url: 'cloud://rejected-image',
      name: 'rejected.jpg'
    },
    createReview: () => Promise.resolve({
      data: {
        reviewId: 'review-rejected'
      }
    }),
    getReview: () => Promise.resolve({
      data: {
        status: 'rejected'
      }
    })
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.media, null);
});

test('uploaded image remains hidden when review does not finish in time', async () => {
  let reviewCalls = 0;

  const result = await reviewUploadedImage({
    media: {
      mediaType: 'image',
      url: 'cloud://pending-image',
      name: 'pending.jpg'
    },
    createReview: () => Promise.resolve({
      data: {
        reviewId: 'review-pending'
      }
    }),
    getReview: () => {
      reviewCalls += 1;
      return Promise.resolve({
        data: {
          status: 'pending'
        }
      });
    },
    delay: () => Promise.resolve(),
    maxAttempts: 2
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.media, null);
  assert.equal(reviewCalls, 2);
});
