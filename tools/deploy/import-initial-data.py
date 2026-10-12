"""One-time offline import into an empty server data directory; never used for updates."""
import hashlib
import json
import pathlib
import shutil
import sys
import tempfile
import zipfile

archive, manifest, destination = map(pathlib.Path, sys.argv[1:])
assert destination.resolve() == pathlib.Path('/var/lib/explore-shoot/data')
assert not any(destination.iterdir()), 'Data already exists; refusing to overwrite server content'
records = json.loads(manifest.read_text(encoding='utf-8-sig'))
with tempfile.TemporaryDirectory(prefix='initial-import-', dir=destination.parent) as temporary:
    stage = pathlib.Path(temporary).resolve()
    with zipfile.ZipFile(archive) as z:
        assert len(z.infolist()) == len(records)
        for entry in z.infolist():
            assert (stage / entry.filename).resolve().is_relative_to(stage)
        z.extractall(stage)
    for record in records:
        file = (stage / record['path']).resolve()
        assert file.is_relative_to(stage)
        assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256']
    for record in records:
        target = destination / record['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(stage / record['path'], target)
        assert hashlib.sha256(target.read_bytes()).hexdigest() == record['sha256']
print(f'Initial migration verified: {len(records)} original files preserved')
