"""Test the /admin nginx gateway against isolated Java data, never production accounts."""
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time

template = pathlib.Path(__file__).with_name('nginx-ip.conf.template').read_text()
temporary = pathlib.Path(tempfile.mkdtemp(prefix='admin-prefix-qa-', dir='/var/lib/explore-shoot')).resolve()
assert temporary.parent == pathlib.Path('/var/lib/explore-shoot')
nginx_file = pathlib.Path('/etc/nginx/conf.d/explore-admin-prefix-qa.conf')
assert not nginx_file.exists(), 'Another prefix test is active'
env = {**os.environ, 'EXPLORE_PROJECT_ROOT': '/opt/explore-shoot/current', 'EXPLORE_DATA_DIR': str(temporary / 'data'), 'PORT': '4294', 'ADMIN_PORT': '4296', 'ADMIN_PASSWORD': 'JavaDeployFixture2026!', 'EXPLORE_VOICE_WARMUP': '0'}
log = open(temporary / 'java.log', 'wb')
process = subprocess.Popen(['java', '-Xmx192m', '-jar', '/opt/explore-shoot/current/backend/target/explore-shoot-backend.jar', '--server.forward-headers-strategy=NATIVE', '--server.tomcat.remoteip.remote-ip-header=X-Forwarded-For'], cwd='/opt/explore-shoot/current', env=env, stdout=log, stderr=log)


def call(path, body=None, method=None, cookie=None, origin='https://47.100.13.159'):
    output = temporary / 'body'
    headers = temporary / 'headers'
    command = ['curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '20', '--resolve', '47.100.13.159:4281:127.0.0.1', '-D', str(headers), '-o', str(output), '-w', '%{http_code}', 'https://47.100.13.159:4281' + path]
    if body is not None:
        command += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(body)]
    if origin:
        command += ['-H', 'Origin: ' + origin]
    if method:
        command += ['-X', method]
    if cookie:
        command += ['-H', 'Cookie: ' + cookie]
    status = subprocess.check_output(command, text=True)
    return int(status), output.read_text(), headers.read_text()


try:
    for attempt in range(35):
        result = subprocess.run(['curl', '--silent', '--fail', 'http://127.0.0.1:4294/api/health'], capture_output=True)
        if result.returncode == 0:
            break
        time.sleep(1)
    else:
        raise AssertionError('Isolated backend did not start')
    staging = template.replace('__PUBLIC_IP__', '47.100.13.159').replace('listen 80;', 'listen 127.0.0.1:4280;').replace('listen 443 ssl http2;', 'listen 127.0.0.1:4281 ssl http2;').replace(':4174', ':4294').replace(':4176', ':4296').replace('explore_origin', 'qa_explore_origin').replace('explore_missing_origin', 'qa_explore_missing_origin').replace('explore_upstream_origin', 'qa_explore_upstream_origin').replace('explore_admin_upstream_origin', 'qa_explore_admin_upstream_origin')
    nginx_file.write_text(staging)
    subprocess.run(['nginx', '-t'], check=True, capture_output=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    for attempt in range(30):
        try:
            with socket.create_connection(('127.0.0.1', 4281), timeout=1):
                break
        except OSError:
            time.sleep(0.1)
    else:
        raise AssertionError('Temporary nginx listener did not become ready')
    status, body, headers = call('/admin')
    assert status == 308 and '/admin/' in headers
    for path, expected in [('/admin/login.html', 'data-audience="admin"'), ('/admin/app.js', '/admin/api/admin/overview'), ('/admin/shared/auth-routing.js', '/admin/login.html'), ('/admin/shared/ui.js', '/admin/api/media'), ('/admin/shared/profile.js', '/admin/api/auth/profile')]:
        status, body, headers = call(path)
        assert status == 200 and expected in body, path
        if path.endswith('.js'):
            output = temporary / (path.replace('/', '_') + '.js')
            output.write_text(body)
    assert call('/admin/api/admin/overview')[0] == 401
    status, body, headers = call('/admin/api/auth/login', {'username': 'admin', 'password': 'JavaDeployFixture2026!'})
    assert status == 200 and json.loads(body)['account']['role'] == 'super'
    admin_cookie = next(line.split(':', 1)[1].strip() for line in headers.splitlines() if line.lower().startswith('set-cookie:'))
    assert 'path=/admin/' in admin_cookie.lower() and 'secure' in admin_cookie.lower() and 'httponly' in admin_cookie.lower()
    admin_cookie = admin_cookie.split(';')[0]
    assert call('/admin/api/admin/overview', cookie=admin_cookie)[0] == 200
    status, body, headers = call('/admin/api/auth/profile', {'nickname': '/Deployment fixture'}, method='PATCH', cookie=admin_cookie)
    assert status == 200 and json.loads(body)['account']['name'] == '/Deployment fixture', 'JSON names must not be URL rewritten'
    status, body, headers = call('/admin/api/auth/profile', {'avatarPreset': 'rabbit'}, method='PATCH', cookie=admin_cookie)
    assert status == 200 and json.loads(body)['account']['avatarPreset'] == 'rabbit'
    assert call('/admin/shared/avatars/rabbit.svg')[0] == 200
    assert call('/api/admin/overview', cookie=admin_cookie)[0] == 404
    status, body, headers = call('/api/auth/me', cookie=admin_cookie)
    assert status == 200 and json.loads(body)['account'] is None
    status, body, headers = call('/api/auth/register', {'username': 'gateway_fixture', 'password': 'JavaDeployFixture2026!', 'nickname': 'Gateway fixture'})
    assert status == 201, body
    user_cookie = next(line.split(':', 1)[1].strip().split(';')[0] for line in headers.splitlines() if line.lower().startswith('set-cookie:'))
    assert call('/admin/api/admin/overview', cookie=user_cookie)[0] == 401
    assert call('/admin/api/auth/login', {'username': 'gateway_fixture', 'password': 'JavaDeployFixture2026!'})[0] == 401
    assert call('/admin/api/auth/login', {'username': 'admin', 'password': 'JavaDeployFixture2026!'}, origin='https://invalid.example')[0] == 403
    print('PASS /admin gateway: redirect, assets, login, path-scoped secure cookie, user/admin isolation, unchanged JSON names and foreign-origin rejection')
finally:
    if nginx_file.exists():
        nginx_file.unlink()
        subprocess.run(['nginx', '-t'], check=True, capture_output=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    log.close()
    shutil.rmtree(temporary)
