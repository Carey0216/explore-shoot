"""Test the /admin nginx gateway against isolated Java data, never production accounts."""
import json
import base64
import uuid
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


def call(path, body=None, method=None, cookie=None, origin='https://47.100.13.159', conditions=None):
    output = temporary / 'body'
    headers = temporary / 'headers'
    output.unlink(missing_ok=True)
    command = ['curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '20', '--resolve', '47.100.13.159:4281:127.0.0.1', '-D', str(headers), '-o', str(output), '-w', '%{http_code}', 'https://47.100.13.159:4281' + path]
    if body is not None:
        command += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(body)]
    if origin:
        command += ['-H', 'Origin: ' + origin]
    if method:
        command += ['-X', method]
    if cookie:
        command += ['-H', 'Cookie: ' + cookie]
    for name, value in (conditions or {}).items():
        command += ['-H', name + ': ' + value]
    status = subprocess.check_output(command, text=True)
    raw_headers = headers.read_text()
    result_body = (output.read_bytes() if 'content-type: image/jpeg' in raw_headers.lower() else output.read_text()) if output.exists() else ''
    return int(status), result_body, raw_headers


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
    status, body, headers = call('/admin/shared/ui.js')
    modified = next(line.split(':', 1)[1].strip() for line in headers.splitlines() if line.lower().startswith('last-modified:'))
    assert call('/admin/shared/ui.js', conditions={'If-Modified-Since': modified})[0] == 304
    status, body, headers = call('/app.js')
    tag = next(line.split(':', 1)[1].strip() for line in headers.splitlines() if line.lower().startswith('etag:'))
    assert call('/app.js', conditions={'If-None-Match': tag})[0] == 304
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
    status, body, headers = call('/admin/api/admin/campus-map/map-models', cookie=admin_cookie)
    assert status == 200 and json.loads(body)['models'][0]['modelUrl'].startswith('/admin/api/admin/campus-map/map-models/')
    status, body, headers = call('/admin/api/admin/campus-map/photo-model', cookie=admin_cookie)
    assert status == 200 and len(json.loads(body)['models']) == 80
    assert call('/api/admin/overview', cookie=admin_cookie)[0] == 404
    status, body, headers = call('/api/auth/me', cookie=admin_cookie)
    assert status == 200 and json.loads(body)['account'] is None
    status, body, headers = call('/api/auth/register', {'username': 'gateway_fixture', 'password': 'JavaDeployFixture2026!', 'nickname': 'Gateway fixture'})
    assert status == 201, body
    user_cookie = next(line.split(':', 1)[1].strip().split(';')[0] for line in headers.splitlines() if line.lower().startswith('set-cookie:'))
    status, body, headers = call('/api/catalog', cookie=user_cookie)
    point_id = json.loads(body)['points'][0]['id']
    status, body, headers = call('/api/points/' + point_id + '/reaction', {'value': 'dislike'}, method='PUT', cookie=user_cookie)
    assert status == 200 and json.loads(body)['point']['myReaction'] == 'dislike'
    assert 'dislikeCount' not in body
    status, body, headers = call('/api/catalog', cookie=user_cookie)
    assert json.loads(body)['points'][-1]['id'] == point_id and 'dislikeCount' not in body
    status, body, headers = call('/admin/api/admin/overview', cookie=admin_cookie)
    assert next(p for p in json.loads(body)['points'] if p['id'] == point_id)['dislikeCount'] == 1
    assert call('/admin/api/admin/overview', cookie=user_cookie)[0] == 401
    assert call('/admin/api/auth/login', {'username': 'gateway_fixture', 'password': 'JavaDeployFixture2026!'})[0] == 401
    assert call('/admin/api/auth/login', {'username': 'admin', 'password': 'JavaDeployFixture2026!'}, origin='https://invalid.example')[0] == 403
    # v6.7: exercise new routes through the same prefix rewrite with disposable data.
    picture = 'data:image/jpeg;base64,' + base64.b64encode(pathlib.Path('/opt/explore-shoot/current/dist/shared/nmu-library.jpg').read_bytes()).decode()
    status, body, _ = call('/admin/api/media', {'photo': picture}, cookie=admin_cookie)
    assert status == 201
    example = json.loads(body)['id']
    point = next(p for p in json.loads(call('/api/catalog')[1])['points'] if p['id'] == point_id)
    status, body, _ = call('/admin/api/admin/shooting-spots', {'pointId':point_id,'title':'Gateway position','standDescription':'Disposable fixture','lng':point['lng'],'lat':point['lat'],'bearing':90,'bestTime':'Evening','status':'published','conditions':['night','solo'],'openingHours':'18:00-21:00','availability':'limited','accessNotice':'Use east entrance','exampleMediaId':example}, cookie=admin_cookie)
    assert status == 201, body
    spot = json.loads(body)
    status, body, _ = call('/admin/api/admin/shooting-spots', cookie=admin_cookie)
    admin_photo = json.loads(body)['spots'][0]['photo']
    assert admin_photo.startswith('/admin/api/admin/shooting-spots/')
    assert call(admin_photo+'?size=thumb', cookie=admin_cookie)[0] == 200
    status, body, _ = call('/api/points/search', {'condition':'night'}, cookie=user_cookie)
    assert status == 200 and json.loads(body)['total'] == 1 and 'viewCount' not in body
    assert call('/media/'+example+'?size=thumb', cookie=user_cookie)[0] == 404
    assert call('/api/shooting-spots/'+spot['id']+'/photo?size=thumb')[0] == 200
    status, body, _ = call('/admin/api/admin/passport/themes', {'title':'Gateway stamp','description':'Disposable fixture','kind':'collection','symbol':'building','pointIds':[point_id],'target':1,'published':True}, cookie=admin_cookie)
    assert status == 201, body
    status, body, _ = call('/admin/api/admin/passport', cookie=admin_cookie)
    assert status == 200 and len(json.loads(body)['atlas']['buildings']) == 145
    assert call('/admin/api/admin/passport/buildings', {'id':'photo:east-landmark','name':'Fixture building','pointIds':[point_id],'revision':0}, method='PUT', cookie=admin_cookie)[0] == 200
    assert call('/api/checkins', {'pointId':point_id,'submissionId':str(uuid.uuid4()),'note':'PRIVATE gateway note'}, cookie=user_cookie)[0] == 201
    status, body, _ = call('/api/my/passport', cookie=user_cookie)
    assert status == 200 and json.loads(body)['achievements'][0]['earned'] and 'PRIVATE gateway note' not in body
    assert call('/api/my/passport')[0] == 401
    assert call('/admin/api/admin/passport', cookie=user_cookie)[0] == 401
    assert call('/api/translation', {'texts':['campus'], 'target':'en'})[0] == 404
    assert call('/shared/i18n.js')[0] == 404
    assert call('/api/auth/login', {'username':'admin','password':'not-real'}, origin=None)[0] == 403
    assert call('/api/mini/config', origin=None)[0] == 200
    assert call('/api/mini/config')[0] == 403
    status, body, headers = call('/api/mini/auth/login', {'username':'gateway_fixture','password':'JavaDeployFixture2026!'}, origin=None)
    assert status == 200, body
    native_token = json.loads(body)['token']
    assert 'set-cookie:' not in headers.lower()
    native_headers = {'Authorization':'Bearer '+native_token}
    assert call('/api/mini/checkins', origin=None, conditions=native_headers)[0] == 200
    assert call('/api/mini/checkins', origin=None, cookie=user_cookie)[0] == 401
    assert call('/api/checkins', conditions=native_headers)[0] == 401
    assert call('/api/mini/admin/overview', origin=None, conditions=native_headers)[0] == 404
    assert call('/admin/api/mini/config', origin=None)[0] == 404
    assert call('/api/mini/auth/logout', {}, origin=None, conditions=native_headers)[0] == 200
    assert call('/api/mini/checkins', origin=None, conditions=native_headers)[0] == 401
    # v6.9: publish and claim only against this disposable gateway store.
    status, body, _ = call('/admin/api/admin/site-content', cookie=admin_cookie)
    assert status == 200, body
    editable = json.loads(body)
    copy = editable['draft']
    copy['notice'] = 'Disposable gateway announcement'
    assert call('/admin/api/admin/site-content', {'revision':editable['revision'],'action':'publish','content':copy}, method='PUT', cookie=admin_cookie)[0] == 200
    assert json.loads(call('/api/site-content')[1])['notice'] == copy['notice']
    assert json.loads(call('/api/mini/site-content', origin=None)[1])['notice'] == copy['notice']
    assert call('/admin/api/admin/site-content', cookie=user_cookie)[0] == 401
    campaign = {'title':'Gateway notice','body':'Disposable content','channels':['web','mini'],'pages':['shots'],'audience':'all','userIds':[], 'startsAt':'','endsAt':'','maxTotal':1,'maxDaily':1,'intervalMinutes':0,'priority':10}
    status, body, _ = call('/admin/api/admin/announcements', {'revision':0,'action':'publish','content':campaign}, cookie=admin_cookie)
    assert status == 200, body
    saved = json.loads(body)
    visitor, visit = str(uuid.uuid4()), str(uuid.uuid4())
    query = '/api/announcements?channel=web&page=shots&visitorId='+visitor+'&visitId='+visit
    candidate = json.loads(call(query)[1])['announcement']
    assert candidate['id'] == saved['id'] and 'userIds' not in candidate
    claim = {'channel':'web','page':'shots','visitorId':visitor,'visitId':visit,'requestId':str(uuid.uuid4()),'revision':saved['revision']}
    assert json.loads(call('/api/announcements/'+saved['id']+'/impressions', claim)[1])['show']
    assert json.loads(call(query)[1])['announcement'] is None
    native_query = '/api/mini/announcements?channel=mini&page=shots&visitorId='+str(uuid.uuid4())+'&visitId='+str(uuid.uuid4())
    assert json.loads(call(native_query, origin=None)[1])['announcement']['id'] == saved['id']
    assert json.loads(call('/api/runtime')[1])['name'] == 'pilot'
    print('PASS v6.9 gateway: draft/public content, targeted announcement claim, frequency cap, native routes and admin isolation')
    print('PASS v6.8 retired translation and independent native Bearer gateway; web Origin / Cookie protections preserved')
    print('PASS v6.7 passport, independent positions, filters, authorized thumbnails and /admin photo prefixes')
    print('PASS /admin gateway: static 304, assets, login, secure cookies, personal reactions and private dislike counts, user/admin isolation and foreign-origin rejection')
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
