const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRecordDateRange,
  createEmptyRecordDraft,
  inferRecordType,
  normalizeRecordDraft,
  sortRecords,
  validateRecordDraft
} = require('../../utils/record');

test('inferRecordType returns text when there is no media', () => {
  assert.equal(inferRecordType([]), 'text');
});

test('inferRecordType returns image for image media', () => {
  assert.equal(inferRecordType([{ mediaType: 'image' }]), 'image');
});

test('validateRecordDraft rejects image and video mixed media', () => {
  const result = validateRecordDraft({
    content: 'weekend',
    recordDate: '2026-07-06',
    mediaList: [
      { mediaType: 'image' },
      { mediaType: 'video' }
    ]
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /不能同时上传图片和视频/);
});

test('validateRecordDraft rejects empty records', () => {
  const result = validateRecordDraft({
    content: '   ',
    recordDate: '2026-07-06',
    mediaList: []
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /请写下内容或添加图片视频/);
});

test('normalizeRecordDraft trims content and infers record type', () => {
  assert.deepEqual(
    normalizeRecordDraft({
      _id: 'record-1',
      content: '  dinner  ',
      recordDate: '2026-07-06',
      mediaList: [{ mediaType: 'image', url: 'cloud://image-a' }]
    }),
    {
      _id: 'record-1',
      content: 'dinner',
      recordDate: '2026-07-06',
      recordType: 'image',
      mediaList: [{ mediaType: 'image', url: 'cloud://image-a' }]
    }
  );
});

test('buildRecordDateRange returns current month bounds', () => {
  assert.deepEqual(
    buildRecordDateRange({ shortcut: 'month' }, new Date('2026-07-06T00:00:00.000Z')),
    {
      startDate: '2026-07-01',
      endDate: '2026-07-06'
    }
  );
});

test('sortRecords puts topped records first and recent records later', () => {
  const records = sortRecords([
    { _id: 'old', recordDate: '2026-07-01', createdAt: 1 },
    { _id: 'top', isTop: true, topAt: 2, recordDate: '2026-06-30', createdAt: 2 },
    { _id: 'new', recordDate: '2026-07-06', createdAt: 3 }
  ]);

  assert.deepEqual(records.map((item) => item._id), ['top', 'new', 'old']);
});

test('createEmptyRecordDraft returns the default editor state', () => {
  assert.deepEqual(createEmptyRecordDraft(), {
    content: '',
    recordDate: '',
    recordType: 'text',
    mediaList: []
  });
});
