#!/usr/bin/env node
// Offline, reviewed cloud export -> source resource. This tool never contacts or writes a server.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
function readExport(file) {
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 4 * 1024 * 1024)
    throw Error('请选择不超过 4MB 的楼宇导出文件');
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    envelope.schema !== 'jingyu-atlas/1' ||
    typeof envelope.payload !== 'string' ||
    !/^[a-f0-9]{64}$/.test(envelope.checksum || '') ||
    digest(envelope.payload) !== envelope.checksum
  )
    throw Error('导出格式或校验不符，未修改任何源码');
  const payload = JSON.parse(envelope.payload);
  if (
    !Array.isArray(payload.buildings) ||
    !payload.buildings.length ||
    !Number.isFinite(Date.parse(payload.exportedAt)) ||
    digest(payload.geometry || '') !== payload.geometryChecksum ||
    digest(payload.content || '') !== payload.contentChecksum
  )
    throw Error('导出文件不完整');
  const content = JSON.parse(payload.content);
  if (
    JSON.stringify(content.buildings) !== JSON.stringify(payload.buildings) ||
    content.geometryChecksum !== payload.geometryChecksum
  )
    throw Error('内容版本校验不一致');
  const ids = new Set();
  for (const b of payload.buildings) {
    if (
      !/^(photo|plan):[a-zA-Z0-9_-]+$/.test(b.id) ||
      ids.has(b.id) ||
      typeof b.name !== 'string' ||
      b.name.length > 80 ||
      !Array.isArray(b.pointIds) ||
      b.pointIds.some((id) => typeof id !== 'string') ||
      !Number.isSafeInteger(b.revision) ||
      b.revision < 0
    )
      throw Error('楼宇字段无效或重复：' + b.id);
    ids.add(b.id);
  }
  return { envelope, payload };
}
function run(args, workspaceRoot = root) {
  const file = args[0];
  if (!file)
    throw Error('用法：node tools/maintenance/atlas-sync.cjs 导出.json [--apply --expect=校验值]');
  const { envelope, payload } = readExport(file);
  const target = path.join(
    workspaceRoot,
    'backend/src/main/resources/passport-atlas-snapshot.json',
  );
  const previous = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
  const old = new Map(
    (previous ? JSON.parse(previous.payload).buildings : []).map((b) => [b.id, b]),
  );
  const changed = payload.buildings.filter(
    (b) => JSON.stringify(old.get(b.id)) !== JSON.stringify(b),
  );
  const report = {
    exportedAt: payload.exportedAt,
    checksum: envelope.checksum,
    contentChecksum: payload.contentChecksum,
    buildings: payload.buildings.length,
    linked: payload.buildings.filter((b) => b.pointIds.length).length,
    changed: changed.map((b) => ({ id: b.id, name: b.name, revision: b.revision })),
    applied: false,
  };
  const compareIndex = args.indexOf('--compare');
  if (compareIndex >= 0) {
    const current = readExport(args[compareIndex + 1]).payload;
    report.matchesCurrent = current.contentChecksum === payload.contentChecksum;
    if (!report.matchesCurrent)
      throw Error('两份导出的内容版本不同，标注有新修改，请重新核对最新导出');
  }
  if (args.includes('--apply')) {
    if (!args.includes('--expect=' + envelope.checksum))
      throw Error('先核对预览，再用 --expect=完整校验值 写入；未修改源码');
    const geo = JSON.parse(payload.geometry);
    if (digest(payload.geometry) !== payload.geometryChecksum) throw Error('基础轮廓校验失败');
    for (const [key, resource] of [
      ['photo', 'campus-photo-roofs.json'],
      ['plan', 'campus-model.json'],
    ]) {
      const actual = JSON.parse(fs.readFileSync(path.join(path.dirname(target), resource), 'utf8'));
      if (JSON.stringify(actual) !== JSON.stringify(geo[key]))
        throw Error('底图轮廓版本不同，请先核对 ' + resource);
    }
    if (previous) {
      const prior = JSON.parse(previous.payload);
      if (Date.parse(prior.exportedAt) > Date.parse(payload.exportedAt))
        throw Error('拒绝以更早的导出覆盖现有源码');
      for (const b of payload.buildings) {
        if ((old.get(b.id)?.revision || 0) > b.revision)
          throw Error('楼宇修订号落后于源码，请重新核对 ' + b.id);
      }
    }
    const temporary = target + '.pending';
    fs.writeFileSync(temporary, JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, target);
    report.applied = true;
  }
  return report;
}
if (require.main === module) {
  try {
    console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { readExport, run };
