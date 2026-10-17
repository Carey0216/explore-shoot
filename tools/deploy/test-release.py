"""Linux deployment failure checks in a temporary tree, with systemctl/curl mocked."""
import hashlib
import io
import json
import os
import pathlib
import subprocess
import tempfile
import zipfile

script = pathlib.Path(__file__).with_name('deploy-release.sh').read_text()


def run_case(kind):
    with tempfile.TemporaryDirectory(prefix='explore-release-test-') as temporary:
        root = pathlib.Path(temporary)
        program, data, config, backups = (root / x for x in ['program', 'data', 'config', 'backups'])
        for folder in [program / 'releases', program / 'incoming', data / 'data', config, backups]:
            folder.mkdir(parents=True, exist_ok=True)
        original = b'original account and photo fixture'
        (data / 'data' / 'store-v2.json').write_bytes(original)
        old = program / 'releases' / 'old'
        old.mkdir()
        (old / 'deployment-manifest.json').write_text(json.dumps({'jarSHA256': 'a' * 64}))
        (program / 'current').symlink_to(old)
        (config / 'server.env').write_text('EXPLORE_BUILD_HASH=' + 'a' * 64 + '\n')
        jar_bytes = io.BytesIO()
        with zipfile.ZipFile(jar_bytes, 'w') as jar:
            jar.writestr('META-INF/MANIFEST.MF', 'Implementation-Version: 6.2.3\r\n')
        contents = {'backend/target/explore-shoot-backend.jar': jar_bytes.getvalue(), 'package.json': b'{}', 'tools/voice-worker.py': b'# isolated fixture\n'}
        manifest = {
            'release': '6.2.3', 'sourceCommit': 'b' * 40, 'dataIncluded': False, 'modelsIncluded': False,
            'jarSHA256': hashlib.sha256(jar_bytes.getvalue()).hexdigest(),
            'files': [{'path': path, 'sha256': hashlib.sha256(value).hexdigest()} for path, value in contents.items()],
        }
        if kind=='sql-start-failure':
            (data/'data'/'campus.mv.db').write_bytes(b'new SQL fixture')
        if kind == 'environment-mismatch':
            manifest['environment'] = 'production'
        if kind == 'bad-hash':
            manifest['files'][0]['sha256'] = '0' * 64
        archive = program / 'incoming' / 'fixture.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            for path, value in contents.items():
                z.writestr(path, value)
            z.writestr('deployment-manifest.json', json.dumps(manifest))
        redirected = script.replace('/opt/explore-shoot', str(program)).replace('/var/lib/explore-shoot', str(data)).replace('/etc/explore-shoot', str(config)).replace('/var/backups/explore-shoot', str(backups))
        helper = root / 'deploy.sh'
        helper.write_text(redirected)
        commands = root / 'commands'
        commands.mkdir()
        (commands / 'systemctl').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_CALLS"\nif [ "$1" = start ] && [ "$FAIL_START" = 1 ] && [ "$(basename "$(readlink -f "$TEST_CURRENT")")" != old ]; then exit 9; fi\nexit 0\n')
        (commands / 'curl').write_text('#!/usr/bin/env python3\nimport json,os,sys\nprint(json.dumps({"backend":"java","audience":"admin" if "4176" in " ".join(sys.argv) else "user","release":"0.0.0" if os.environ["BAD_HEALTH"]=="1" else "6.2.3"}))\n')
        (commands / 'sleep').write_text('#!/bin/sh\nexit 0\n')
        for command in commands.iterdir():
            command.chmod(0o755)
        calls = root / 'calls'
        env = {**os.environ, 'PATH': str(commands) + os.pathsep + os.environ['PATH'], 'BAD_HEALTH': '1' if kind == 'bad-health' else '0', 'FAIL_START': '1' if kind in ('start-failure','sql-start-failure') else '0', 'TEST_CURRENT': str(program / 'current'), 'TEST_CALLS': str(calls)}
        result = subprocess.run(['bash', str(helper), str(archive)], env=env, capture_output=True, text=True, timeout=20)
        assert (data / 'data' / 'store-v2.json').read_bytes() == original
        if kind == 'success':
            assert result.returncode == 0, result.stderr + result.stdout
            assert (program / 'current').resolve().name == 'v6.2.3-bbbbbbbb'
            assert list(backups.glob('*.tar.gz'))
        else:
            assert result.returncode != 0
            assert (program / 'current').resolve() == old if kind!='sql-start-failure' else (program / 'current').resolve()!=old
            if kind=='sql-start-failure':
                assert 'Refusing to start a legacy JSON program' in result.stdout
                assert (data/'data'/'campus.mv.db').read_bytes()==b'new SQL fixture'
            if kind in ('bad-hash', 'environment-mismatch'):
                assert not calls.exists(), 'Unverified source must never stop the live service'
            else:
                assert list(backups.glob('*.tar.gz'))
                assert 'start explore-shoot.service' in calls.read_text()
        print('PASS deployment fixture: ' + kind + ', data preserved')


for case in ['success', 'bad-hash', 'bad-health', 'start-failure', 'environment-mismatch','sql-start-failure']:
    run_case(case)
