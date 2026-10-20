// Input validation for uploaded files sent as base64 text.
// Dependency-free so it can be unit-tested with `node --test`.
//
// Why this exists (audit finding S1): the public admission and teacher-job
// forms stored any string as a "photo", and the admin screen placed that
// string inside an <img src="..."> attribute. A crafted value could break out
// of the attribute and run script in an admin's browser. Accepting only real
// base64 that decodes to a real image closes that path on the server; the
// page also renders photos safely (see safeImageSrc in public/index.html).

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Decoded-size caps. Base64 text is ~4/3 of the decoded size.
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 3.5 * 1024 * 1024;

const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: b => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: b => b.length > 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' }
];

const DOCUMENT_SIGNATURES = [
  { mime: 'application/pdf', test: b => b.length > 4 && b.slice(0, 5).toString('latin1') === '%PDF-' },
  // .docx / .xlsx are ZIP containers.
  { mime: 'application/zip', test: b => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  // Legacy .doc (OLE compound file).
  { mime: 'application/msword', test: b => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
  ...IMAGE_SIGNATURES
];

function decodeStrictBase64(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s.length % 4 !== 0 || !BASE64_RE.test(s)) return null;
  return Buffer.from(s, 'base64');
}

function check(value, signatures, maxBytes) {
  const buf = decodeStrictBase64(value);
  if (!buf) return { ok: false, reason: 'not_base64' };
  if (buf.length > maxBytes) return { ok: false, reason: 'too_large' };
  const sig = signatures.find(s => s.test(buf));
  if (!sig) return { ok: false, reason: 'unsupported_type' };
  return { ok: true, mime: sig.mime, bytes: buf.length };
}

function checkImage(value) { return check(value, IMAGE_SIGNATURES, MAX_IMAGE_BYTES); }
function checkDocument(value) { return check(value, DOCUMENT_SIGNATURES, MAX_DOCUMENT_BYTES); }

// A file name is display text only; strip path parts and control characters.
function cleanFileName(name) {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>"'`]/g, '').trim();
  return base ? base.slice(0, 120) : null;
}

// Whiteboard snapshots arrive as data URLs from the teacher's canvas.
const MAX_SNAPSHOT_CHARS = 1_500_000;
function isSafePngDataUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_SNAPSHOT_CHARS) return false;
  const prefix = 'data:image/png;base64,';
  if (!value.startsWith(prefix)) return false;
  const r = checkImage(value.slice(prefix.length));
  return r.ok && r.mime === 'image/png';
}

module.exports = { checkImage, checkDocument, cleanFileName, isSafePngDataUrl, decodeStrictBase64, MAX_IMAGE_BYTES, MAX_DOCUMENT_BYTES };
