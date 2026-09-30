const crypto = require('node:crypto');
const id = () => crypto.randomUUID();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, value) {
  try {
    const [algorithm, salt, expected] = value.split(':');
    if (algorithm !== 'scrypt') return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const buffer = Buffer.from(expected, 'hex');
    return actual.length === buffer.length && crypto.timingSafeEqual(actual, buffer);
  } catch { return false; }
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, max = 2000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail('密码需为 8—128 个字符');
  return value;
}
function username(value) {
  const result = text(value, 32).toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(result)) fail('账号需为 3—32 位字母、数字或下划线');
  return result;
}
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cleanJPEG(buffer) {
  if (buffer.length < 4 || buffer[0] !== 255 || buffer[1] !== 216) fail('照片格式无效，请重新上传');
  const parts = [buffer.subarray(0, 2)]; let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 255) fail('照片数据无效');
    const marker = buffer[offset + 1];
    if (marker === 218 || marker === 217) { parts.push(buffer.subarray(offset)); return Buffer.concat(parts); }
    if (offset + 4 > buffer.length) fail('照片数据不完整');
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) fail('照片数据不完整');
    if (![225, 237, 254].includes(marker)) parts.push(buffer.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  fail('照片数据不完整');
}
module.exports = { id, digest, hashPassword, verifyPassword, fail, text, password, username, escape, cleanJPEG };
