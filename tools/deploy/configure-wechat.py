"""Receive credential JSON on encrypted SSH stdin; never put it in arguments or output."""
import datetime
import json
import os
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.request


def configure():
    if os.getuid() != 0:
        raise SystemExit('Run as root')
    incoming = json.load(__import__('sys').stdin)
    app_id = incoming.get('WECHAT_APP_ID', '')
    secret = incoming.get('WECHAT_APP_SECRET', '')
    mode = incoming.get('WECHAT_LOGIN_MODE', '')
    if not re.fullmatch(r'wx[a-f0-9]{16}', app_id) or not re.fullmatch(r'[A-Za-z0-9_-]{16,256}', secret):
        raise SystemExit('Invalid WeChat configuration; no change applied')
    if mode not in ('test', 'bound', 'off', 'production'):
        raise SystemExit('Invalid WeChat login mode')
    if mode == 'production':
        data = json.loads(pathlib.Path('/var/lib/explore-shoot/data/store-v2.json').read_text())
        if any(u.get('wechatTestAccount') for u in data.get('users', [])) or data.get('wechatTestBindings') or data.get('pendingWechatTestDeletes'):
            raise SystemExit('Retire test identities and their data before selecting production mode')
    destination = pathlib.Path('/etc/explore-shoot/server.env')
    before = destination.read_bytes()
    os.umask(0o077)
    backup = pathlib.Path('/var/backups/explore-shoot') / ('wechat-env-before-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f') + '.env')
    backup.write_bytes(before)
    keep = [line for line in before.decode().splitlines() if not line.startswith(('WECHAT_APP_ID=', 'WECHAT_APP_SECRET=', 'WECHAT_LOGIN_MODE='))]
    keep += ['WECHAT_APP_ID=' + app_id, 'WECHAT_APP_SECRET=' + secret, 'WECHAT_LOGIN_MODE=' + mode]
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix='.wechat-', delete=False) as target:
            target.write(('\n'.join(keep) + '\n').encode())
            temporary = pathlib.Path(target.name)
        temporary.chmod(0o600)
        os.replace(temporary, destination)
        subprocess.run(['systemctl', 'restart', 'explore-shoot'], check=True)
        for _ in range(45):
            try:
                with urllib.request.urlopen('http://127.0.0.1:4174/api/mini/config', timeout=2) as response:
                    current = json.load(response)
                if current['wechatLogin'] != (mode != 'off') or current['wechatTestLogin'] != (mode == 'test'):
                    raise ValueError('Backend configuration mismatch')
                print('WeChat server configuration verified; mode=' + mode)
                return
            except Exception:
                time.sleep(1)
        raise RuntimeError('Backend did not become ready')
    except BaseException:
        destination.write_bytes(before)
        destination.chmod(0o600)
        subprocess.run(['systemctl', 'restart', 'explore-shoot'], check=True)
        raise SystemExit('WeChat configuration failed; previous environment restored')


if __name__ == '__main__':
    configure()
