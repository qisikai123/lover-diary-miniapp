const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseRecordMedia,
  getMediaChooseFailureMessage,
  isMediaChooseCancel
} = require('../../utils/media-picker');

test('chooseRecordMedia uses chooseImage first for image selection', async () => {
  const calls = [];
  const files = await chooseRecordMedia({
    mediaType: 'image',
    count: 2,
    uniApi: {
      chooseImage(options) {
        calls.push({
          api: 'chooseImage',
          options
        });
        options.success({
          tempFilePaths: ['/tmp/a.jpg', '/tmp/b.jpg']
        });
      },
      chooseMedia(options) {
        calls.push({
          api: 'chooseMedia',
          options
        });
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].api, 'chooseImage');
  assert.deepEqual(calls[0].options.sizeType, ['compressed']);
  assert.deepEqual(files, [
    {
      path: '/tmp/a.jpg',
      mediaType: 'image'
    },
    {
      path: '/tmp/b.jpg',
      mediaType: 'image'
    }
  ]);
});

test('chooseRecordMedia uses chooseVideo first for video selection', async () => {
  const calls = [];
  const files = await chooseRecordMedia({
    mediaType: 'video',
    uniApi: {
      chooseVideo(options) {
        calls.push({
          api: 'chooseVideo',
          options
        });
        options.success({
          tempFilePath: '/tmp/a.mp4'
        });
      },
      chooseMedia(options) {
        calls.push({
          api: 'chooseMedia',
          options
        });
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].api, 'chooseVideo');
  assert.equal(calls[0].options.compressed, true);
  assert.deepEqual(files, [
    {
      path: '/tmp/a.mp4',
      mediaType: 'video',
      name: '视频'
    }
  ]);
});

test('chooseRecordMedia falls back to chooseMedia when legacy image picker is unavailable', async () => {
  const calls = [];
  const files = await chooseRecordMedia({
    mediaType: 'image',
    count: 1,
    uniApi: {
      chooseMedia(options) {
        calls.push(options);
        options.success({
          tempFiles: [
            {
              tempFilePath: '/tmp/a.jpg',
              fileType: 'image'
            }
          ]
        });
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].mediaType, ['image']);
  assert.deepEqual(files, [
    {
      path: '/tmp/a.jpg',
      mediaType: 'image'
    }
  ]);
});

test('chooseRecordMedia treats user cancel as an empty selection', async () => {
  const files = await chooseRecordMedia({
    mediaType: 'image',
    uniApi: {
      chooseMedia(options) {
        options.fail({
          errMsg: 'chooseMedia:fail cancel',
          errCode: 1101001
        });
      }
    }
  });

  assert.deepEqual(files, []);
});

test('media picker failures surface actionable privacy guidance', async () => {
  assert.equal(
    isMediaChooseCancel({
      errMsg: 'chooseVideo:fail cancel'
    }),
    true
  );
  assert.equal(
    getMediaChooseFailureMessage({
      errMsg: 'chooseImage:fail api scope is not declared in the privacy agreement'
    }),
    '请完善小程序隐私协议配置'
  );
});
