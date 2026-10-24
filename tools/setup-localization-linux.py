#!/usr/bin/env python3
"""Install pinned local inference into the existing shared runtime, without touching app data."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import zipfile

os.umask(0o077)
project = pathlib.Path(__file__).resolve().parent.parent
runtime = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else project / 'tools/bin/localization').resolve()
if runtime.name != 'localization':
    raise SystemExit('The target must be the localization runtime directory')
runtime.mkdir(parents=True, exist_ok=True)
python = runtime / 'env/bin/python'
if not python.is_file():
    subprocess.run([sys.executable, '-m', 'venv', str(runtime / 'env')], check=True)
subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', 'ctranslate2==4.6.0', 'sentencepiece==0.2.1', 'setuptools==80.9.0'], check=True)
receipts = []
for model in json.loads((project / 'tools/localization-models.json').read_text()):
    folder = runtime / model['name']
    receipt = runtime / (model['name'] + '.verified.json')
    if folder.is_dir() and receipt.is_file() and json.loads(receipt.read_text()).get('archiveSHA256') == model['sha256']:
        files = json.loads(receipt.read_text())['files']
        if all((folder / name).is_file() and hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest for name, digest in files.items()):
            receipts.append(model['name']); continue
    if folder.exists():
        raise SystemExit('Existing unverified model retained; inspect before replacing: ' + str(folder))
    with tempfile.TemporaryDirectory(prefix='download-', dir=runtime) as temporary:
        temporary = pathlib.Path(temporary)
        archive = temporary / 'model.argosmodel'
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                        '--connect-timeout', '15', '--max-time', '600', '--retry', '2',
                        '--retry-all-errors', model['url'], '--output', str(archive)], check=True)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != model['sha256']:
            raise SystemExit('Official model SHA256 mismatch')
        stage = temporary / 'extracted'; stage.mkdir()
        with zipfile.ZipFile(archive) as zipped:
            for entry in zipped.infolist():
                if not (stage / entry.filename).resolve().is_relative_to(stage.resolve()) or entry.external_attr >> 16 & 0o170000 == 0o120000:
                    raise SystemExit('Unsafe archive member')
            zipped.extractall(stage)
        if not list(stage.rglob('model.bin')) or not list(stage.rglob('sentencepiece.model')):
            raise SystemExit('Incomplete model')
        files = {str(file.relative_to(stage)): hashlib.sha256(file.read_bytes()).hexdigest() for file in stage.rglob('*') if file.is_file()}
        stage.rename(folder)
        receipt.write_text(json.dumps({'archiveSHA256':model['sha256'],'files':files}, indent=2))
        receipts.append(model['name'])
print(json.dumps({'localInference':True,'models':receipts,'runtime':str(runtime)}))
