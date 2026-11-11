const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, readExport } = require('../tools/maintenance/atlas-sync.cjs');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jingyu-atlas-sync-'));
const resource = path.join(temporary, 'backend/src/main/resources');
fs.mkdirSync(resource, { recursive: true });
const photo = { imageWidth: 100, imageHeight: 100, buildings: [] },
  plan = { buildings: [] };
fs.writeFileSync(path.join(resource, 'campus-photo-roofs.json'), JSON.stringify(photo));
fs.writeFileSync(path.join(resource, 'campus-model.json'), JSON.stringify(plan));
function exported(name, date, title = '图书馆') {
  const geometry = JSON.stringify({ photo, plan });
  const buildings = [
    {
      id: 'photo:roof-1',
      name: title,
      pointIds: ['p1'],
      revision: 1,
      outline: [
        [1, 1],
        [20, 1],
        [20, 20],
      ],
      holes: [],
    },
  ];
  const content = JSON.stringify({ geometryChecksum: sha(geometry), buildings });
  const payload = JSON.stringify({
    exportedAt: date,
    geometry,
    geometryChecksum: sha(geometry),
    buildings,
    content,
    contentChecksum: sha(content),
  });
  const envelope = { schema: 'jingyu-atlas/1', payload, checksum: sha(payload) };
  const file = path.join(temporary, name + '.json');
  fs.writeFileSync(file, JSON.stringify(envelope));
  return { file, envelope };
}
try {
  const first = exported('first', '2026-11-03T00:00:00Z');
  const later = exported('later', '2026-11-03T01:00:00Z');
  const target = path.join(resource, 'passport-atlas-snapshot.json');
  assert.equal(run([first.file], temporary).applied, false);
  assert.equal(fs.existsSync(target), false, 'Preview must not write source');
  assert.throws(() => run([first.file, '--apply'], temporary), /expect/);
  assert.equal(
    run([first.file, '--compare', later.file], temporary).matchesCurrent,
    true,
    'Export time does not change content version',
  );
  assert.equal(
    run([later.file, '--apply', '--expect=' + later.envelope.checksum], temporary).applied,
    true,
  );
  const original = fs.readFileSync(target);
  assert.throws(
    () => run([first.file, '--apply', '--expect=' + first.envelope.checksum], temporary),
    /更早/,
  );
  const changed = exported('changed', '2026-11-03T02:00:00Z', '图书馆新标注');
  assert.throws(() => run([first.file, '--compare', changed.file], temporary), /新修改/);
  fs.writeFileSync(changed.file, JSON.stringify({ ...changed.envelope, checksum: '0'.repeat(64) }));
  assert.throws(() => readExport(changed.file), /校验/);
  assert.deepEqual(
    fs.readFileSync(target),
    original,
    'Rejected exports must leave source byte-identical',
  );
  console.log(
    'Atlas sync: preview, confirmation checksum, stable content version, stale/corrupt rejection passed.',
  );
} finally {
  const resolved = fs.realpathSync(temporary);
  assert.ok(
    resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('jingyu-atlas-sync-'),
  );
  fs.rmSync(resolved, { recursive: true });
}
