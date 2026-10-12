#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
runtime=/var/lib/explore-shoot/runtime/tools-bin
incoming=/opt/explore-shoot/incoming
python3 -m venv "$runtime/voice-env"
"$runtime/voice-env/bin/pip" install -r /opt/explore-shoot/current/tools/voice-requirements.txt
echo 'a1e94694776049035c4f2c6529f003aaece993c76aae9a78995831c3c4dcafc6  /opt/explore-shoot/incoming/kokoro-int8-multi-lang-v1_1.tar.bz2' | sha256sum --check
tar -xf "$incoming/kokoro-int8-multi-lang-v1_1.tar.bz2" -C "$runtime"
python3 -m venv "$runtime/translation/env"
"$runtime/translation/env/bin/pip" install 'ctranslate2==4.6.0' 'sentencepiece==0.2.1' 'opencc-python-reimplemented==0.1.7' 'setuptools==80.9.0'
python3 - "$incoming" "$runtime" <<'PY'
import hashlib,json,pathlib,sys,zipfile
incoming,runtime=map(pathlib.Path,sys.argv[1:])
models=json.loads(pathlib.Path('/opt/explore-shoot/current/tools/translation-models.json').read_text())
for m in models:
    archive=incoming/(m['name']+'.argosmodel')
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==m['sha256'].lower()
    root=(runtime/'translation'/m['name']).resolve()
    root.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        assert all((root/n).resolve().is_relative_to(root) for n in z.namelist())
        z.extractall(root)
print('Four original translation models verified and extracted')
PY
chown -R explore-shoot:explore-shoot "$runtime"
systemctl restart explore-shoot.service
echo 'Linux AI environments installed; startup warms navigation prompts.'
