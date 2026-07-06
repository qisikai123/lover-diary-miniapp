const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCloudFunctionPayload
} = require('../../services/cloud/index');

test('buildCloudFunctionPayload returns the expected action envelope', () => {
  assert.deepEqual(
    buildCloudFunctionPayload('record', 'getRecordList', { page: 1 }),
    {
      name: 'record',
      data: {
        action: 'getRecordList',
        payload: { page: 1 }
      }
    }
  );
});
