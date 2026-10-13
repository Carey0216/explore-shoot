#!/usr/bin/env bash
set -Eeuo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
archive=$(realpath "${1:?Provide a checked deployment ZIP}")
case "$archive" in /opt/explore-shoot/incoming/*.zip) ;; *) echo 'Archive must be in incoming directory'; exit 1;; esac
stamp=$(date -u +%Y%m%d-%H%M%S)
stage=$(mktemp -d /opt/explore-shoot/releases/.stage-XXXXXXXX)
cleanup_stage() {
    case "$stage" in
        /opt/explore-shoot/releases/.stage-*) [ ! -d "$stage" ] || rm -rf -- "$stage" ;;
        *) echo 'Unexpected temporary stage path; cleanup refused' >&2 ;;
    esac
}
trap cleanup_stage EXIT
python3 - "$archive" "$stage" <<'PY'
import hashlib,json,pathlib,re,stat,sys,zipfile
root=pathlib.Path(sys.argv[2]).resolve()
with zipfile.ZipFile(sys.argv[1]) as z:
    for e in z.infolist():
        if '\\' in e.filename:
            raise SystemExit('ZIP entries must use portable forward-slash paths')
        p=(root/e.filename).resolve()
        if not p.is_relative_to(root) or stat.S_ISLNK(e.external_attr>>16):
            raise SystemExit('Unsafe archive path')
    z.extractall(root)
m=json.loads((root/'deployment-manifest.json').read_text(encoding='utf-8-sig'))
assert re.fullmatch(r'\d+\.\d+\.\d+',m['release'])
assert re.fullmatch(r'[a-f0-9]{40}',m['sourceCommit'])
assert m['dataIncluded'] is False and m['modelsIncluded'] is False
for e in m['files']:
    p=(root/e['path']).resolve()
    assert p.is_relative_to(root) and not e['path'].startswith(('data/','backups/','tools/bin/'))
    assert hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256']
assert hashlib.sha256((root/'backend/target/explore-shoot-backend.jar').read_bytes()).hexdigest()==m['jarSHA256']
with zipfile.ZipFile(root/'backend/target/explore-shoot-backend.jar') as jar:
    manifest=jar.read('META-INF/MANIFEST.MF').decode()
    assert 'Implementation-Version: '+m['release']+'\r\n' in manifest
(root/'.release-id').write_text('v'+m['release']+'-'+m['sourceCommit'][:8])
PY
release=$(cat "$stage/.release-id")
version=${release#v}
version=${version%-*}
target="/opt/explore-shoot/releases/$release"
test ! -e "$target" || { echo 'Immutable release already exists; use an existing release for rollback'; exit 1; }
ln -s /var/lib/explore-shoot/runtime/tools-bin "$stage/tools/bin"
chown -R root:root "$stage"
chmod -R a+rX "$stage"
mv "$stage" "$target"
old=$(readlink -f /opt/explore-shoot/current || true)
set_build() {
    build=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8-sig"))["jarSHA256"])' "$1/deployment-manifest.json")
    sed -i '/^EXPLORE_BUILD_HASH=/d' /etc/explore-shoot/server.env
    printf 'EXPLORE_BUILD_HASH=%s\n' "$build" >> /etc/explore-shoot/server.env
}
rollback_error() {
    result=$?
    trap - ERR
    set +e
    systemctl stop explore-shoot.service
    if [ -n "$old" ] && [ -d "$old" ]; then
        ln -sfn "$old" /opt/explore-shoot/current.next
        mv -Tf /opt/explore-shoot/current.next /opt/explore-shoot/current
        set_build "$old"
        systemctl start explore-shoot.service
    fi
    echo 'Update failed; previous program restored where available. Data and backup retained.'
    exit "$result"
}
trap rollback_error ERR
systemctl stop explore-shoot.service
umask 077
backup="/var/backups/explore-shoot/before-$release-$stamp.tar.gz"
tar --exclude=.java-backend.lock -czf "$backup" -C /var/lib/explore-shoot/data .
sha256sum "$backup" > "$backup.sha256"
ln -s "$target" /opt/explore-shoot/current.next
mv -Tf /opt/explore-shoot/current.next /opt/explore-shoot/current
set_build "$target"
systemctl start explore-shoot.service
healthy=0
for i in $(seq 1 45); do
    if curl --fail --silent http://127.0.0.1:4174/api/health | python3 -c 'import json,sys; h=json.load(sys.stdin); assert h["backend"]=="java" and h["release"]==sys.argv[1]' "$version" 2>/dev/null \
       && curl --fail --silent -H 'Host: admin.localhost' http://127.0.0.1:4176/api/health | python3 -c 'import json,sys; h=json.load(sys.stdin); assert h["audience"]=="admin" and h["release"]==sys.argv[1]' "$version" 2>/dev/null; then healthy=1; break; fi
    sleep 1
done
if [ "$healthy" != 1 ]; then
    echo 'New program did not pass both health checks.'
    false
fi
systemctl enable explore-shoot.service
trap - ERR
printf 'Deployment ready: %s; backup: %s\n' "$release" "$backup"
