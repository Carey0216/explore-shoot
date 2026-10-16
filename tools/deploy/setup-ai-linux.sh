#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
runtime=/var/lib/explore-shoot/runtime/tools-bin
incoming=/opt/explore-shoot/incoming
python3 -m venv "$runtime/voice-env"
"$runtime/voice-env/bin/pip" install -r /opt/explore-shoot/current/tools/voice-requirements.txt
echo 'a1e94694776049035c4f2c6529f003aaece993c76aae9a78995831c3c4dcafc6  /opt/explore-shoot/incoming/kokoro-int8-multi-lang-v1_1.tar.bz2' | sha256sum --check
tar -xf "$incoming/kokoro-int8-multi-lang-v1_1.tar.bz2" -C "$runtime"
chown -R explore-shoot:explore-shoot "$runtime"
systemctl restart explore-shoot.service
echo 'Linux AI environments installed; startup warms navigation prompts.'
