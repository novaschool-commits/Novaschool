// Upload validation (finding S1). Run: node --test tests/unit/
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkImage, checkDocument, cleanFileName, isSafePngDataUrl } = require('../../lib/validate');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex').toString('base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]).toString('base64');
const PDF = Buffer.from('%PDF-1.4\n%fake but well-formed header\n').toString('base64');

test('accepts real PNG and JPEG images', () => {
  assert.equal(checkImage(PNG).ok, true);
  assert.equal(checkImage(PNG).mime, 'image/png');
  assert.equal(checkImage(JPEG).mime, 'image/jpeg');
});

test('rejects the attribute-breakout payload from the audit', () => {
  const payloads = [
    'x" onerror="alert(1)',
    'AAAA" onerror="fetch(\'//evil\')',
    '"><script>alert(1)</script>',
    'javascript:alert(1)',
    PNG + '" onerror="x'
  ];
  for (const p of payloads) assert.equal(checkImage(p).ok, false, p);
});

test('rejects base64 that is not an image', () => {
  assert.equal(checkImage(Buffer.from('hello world, not an image').toString('base64')).reason, 'unsupported_type');
  assert.equal(checkImage(PDF).ok, false);
});

test('rejects non-strings, empty and malformed base64', () => {
  for (const v of [null, undefined, 42, {}, [], '', '   ', 'abc', 'ab=c', '====']) {
    assert.equal(checkImage(v).ok, false, String(v));
  }
});

test('enforces the size cap', () => {
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4 * 1024 * 1024)]).toString('base64');
  assert.equal(checkImage(big).reason, 'too_large');
});

test('documents: PDF, Word (zip and legacy) and images accepted; others refused', () => {
  assert.equal(checkDocument(PDF).mime, 'application/pdf');
  assert.equal(checkDocument(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]).toString('base64')).mime, 'application/zip');
  assert.equal(checkDocument(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]).toString('base64')).mime, 'application/msword');
  assert.equal(checkDocument(PNG).ok, true);
  assert.equal(checkDocument(Buffer.from('MZ executable header').toString('base64')).ok, false);
  assert.equal(checkDocument(Buffer.from('<html><script>').toString('base64')).ok, false);
});

test('file names lose paths, quotes and control characters', () => {
  assert.equal(cleanFileName('../../etc/passwd'), 'passwd');
  assert.equal(cleanFileName('C:\\Users\\x\\cv".pdf'), 'cv.pdf');
  assert.equal(cleanFileName('<img src=x onerror=1>.pdf'), 'img src=x onerror=1.pdf');
  assert.equal(cleanFileName(''), null);
  assert.equal(cleanFileName(7), null);
  assert.equal(cleanFileName('a'.repeat(500)).length, 120);
});

test('whiteboard snapshots must be real PNG data URLs', () => {
  assert.equal(isSafePngDataUrl('data:image/png;base64,' + PNG), true);
  assert.equal(isSafePngDataUrl('data:image/jpeg;base64,' + JPEG), false);
  assert.equal(isSafePngDataUrl('data:image/png;base64,' + JPEG), false);
  assert.equal(isSafePngDataUrl('javascript:alert(1)'), false);
  assert.equal(isSafePngDataUrl('data:image/png;base64,' + 'A'.repeat(2_000_000)), false);
});
