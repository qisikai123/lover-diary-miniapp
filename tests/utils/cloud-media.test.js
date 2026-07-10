const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRecordMediaDisplayUrls,
  resolveRecordsMediaDisplayUrls
} = require('../../utils/cloud-media');

test('resolveRecordsMediaDisplayUrls resolves unique cloud file ids on the client', async () => {
  const calls = [];
  const records = await resolveRecordsMediaDisplayUrls([
    {
      _id: 'record-1',
      mediaList: [
        { mediaType: 'image', url: 'cloud://image-a' },
        { mediaType: 'image', url: 'cloud://image-a' }
      ]
    },
    {
      _id: 'record-2',
      mediaList: [
        { mediaType: 'image', url: 'https://example.com/image-b.jpg' }
      ]
    }
  ], async (fileList) => {
    calls.push(fileList);

    return {
      fileList: [
        {
          fileID: 'cloud://image-a',
          tempFileURL: 'https://tmp.example.com/image-a.jpg'
        }
      ]
    };
  });

  assert.deepEqual(calls, [['cloud://image-a']]);
  assert.equal(
    records[0].mediaList[0].displayUrl,
    'https://tmp.example.com/image-a.jpg'
  );
  assert.equal(
    records[1].mediaList[0].displayUrl,
    'https://example.com/image-b.jpg'
  );
});

test('resolveRecordMediaDisplayUrls resolves a single record', async () => {
  const record = await resolveRecordMediaDisplayUrls({
    _id: 'record-1',
    mediaList: [
      { mediaType: 'image', url: 'cloud://image-detail' }
    ]
  }, async () => ({
    fileList: [
      {
        fileID: 'cloud://image-detail',
        tempFileURL: 'https://tmp.example.com/image-detail.jpg'
      }
    ]
  }));

  assert.equal(
    record.mediaList[0].displayUrl,
    'https://tmp.example.com/image-detail.jpg'
  );
});
