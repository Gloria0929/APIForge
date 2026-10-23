require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, cleanLocustError, parseLocustProgress } = require('../src/modules/test/locust.service');

test('parseCsv keeps quoted commas, escaped quotes and CRLF rows', () => {
  const text = 'Type,Name,Error\r\nGET,"/a,b","He said ""hi"""\r\n\nPOST,/c,boom\n';
  const rows = parseCsv(text);
  assert.deepEqual(rows[0], ['Type', 'Name', 'Error']);
  assert.deepEqual(rows[1], ['GET', '/a,b', 'He said "hi"']);
  assert.deepEqual(rows[2], ['POST', '/c', 'boom']);
  assert.equal(rows.length, 3);
});

test('cleanLocustError unwraps catch_response failures', () => {
  assert.equal(cleanLocustError("CatchResponseError('FAILED: HTTP 500')"), 'FAILED: HTTP 500');
  assert.equal(
    cleanLocustError("CatchResponseError('ERROR: host=\\'127.0.0.1\\' refused')"),
    "ERROR: host='127.0.0.1' refused",
  );
  assert.equal(cleanLocustError('ConnectionError: boom'), 'ConnectionError: boom');
});

test('parseLocustProgress reads progress lines and ignores noise', () => {
  assert.deepEqual(
    parseLocustProgress('##APIFORGE_PROGRESS {"total":12,"failed":3,"runs":4,"elapsedSeconds":2.5}'),
    { total: 12, failed: 3, runs: 4, elapsedSeconds: 2.5 },
  );
  assert.equal(parseLocustProgress('regular log line'), null);
  assert.equal(parseLocustProgress('##APIFORGE_PROGRESS not-json'), null);
});
