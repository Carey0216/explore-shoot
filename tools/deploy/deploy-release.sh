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
expected=m.get('environment','pilot')
assert expected in ('pilot','production')
settings=pathlib.Path('/etc/explore-shoot/server.env').read_text().splitlines()
actual=next((v.split('=',1)[1] for v in settings if v.startswith('EXPLORE_ENV=')),'pilot')
assert expected==actual,'Destination environment mismatch'
identity=pathlib.Path('/var/lib/explore-shoot/data/.environment.json')
if identity.exists(): assert json.loads(identity.read_text())['name']==expected,'Data environment mismatch'
else: assert expected=='pilot','Production identity must be initialized separately'

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
nginx_backup=''
owner_username=${2:-}
public_ip=${3:-}
if [ -n "$owner_username" ]; then
    [[ "$owner_username" =~ ^[a-zA-Z0-9_]{3,32}$ ]] || exit 1
    # Credential is delivered over verified SSH stdin, never argv, archive or source.
    IFS= read -r owner_password
    test -n "$owner_password"
fi
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
    if [ -n "$nginx_backup" ]; then
        cp -- "$nginx_backup" /etc/nginx/sites-available/explore-shoot
        nginx -t && systemctl reload nginx
    fi
    if [ -f /var/lib/explore-shoot/data/campus.mv.db ] && [ ! -f "$old/backend/src/main/java/cn/campus/storage/sql/SqlDatabase.java" ]; then
        echo 'SQL data retained. Refusing to start a legacy JSON program against a stale migration source. Service stopped for recovery; do not restore old JSON over SQL.'
        exit "$result"
    fi
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
legacy_migration=0
if [ ! -f /var/lib/explore-shoot/data/campus.mv.db ] && [ -f /var/lib/explore-shoot/data/store-v2.json ]; then legacy_migration=1; fi
if [ -n "$owner_username" ]; then
    environment=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8-sig")).get("environment","pilot"))' "$target/deployment-manifest.json")
    printf '%s\n' "$owner_password" | runuser -u explore-shoot -- env EXPLORE_PROJECT_ROOT="$target" EXPLORE_DATA_DIR=/var/lib/explore-shoot/data EXPLORE_ENV="$environment" /usr/bin/java -Xmx256m -Dfile.encoding=UTF-8 -jar "$target/backend/target/explore-shoot-backend.jar" --tool=owner-bootstrap "$owner_username"
    unset owner_password
    if [ "$legacy_migration" = 1 ]; then
        install -d -o explore-shoot -g explore-shoot -m 700 /var/lib/explore-shoot/maintenance
        verification="/var/lib/explore-shoot/maintenance/verify-$release-$stamp.json"
        runuser -u explore-shoot -- env EXPLORE_PROJECT_ROOT="$target" EXPLORE_DATA_DIR=/var/lib/explore-shoot/data EXPLORE_ENV="$environment" /usr/bin/java -Xmx256m -Dfile.encoding=UTF-8 -jar "$target/backend/target/explore-shoot-backend.jar" --tool=storage export-json "$verification"
        python3 "$target/tools/deploy/verify-sql-migration.py" "$backup" "$verification" "$owner_username" /var/lib/explore-shoot/data
        rm -- "$verification"
    fi
fi
if [ -n "$public_ip" ]; then
    python3 -c 'import ipaddress,sys; assert ipaddress.ip_address(sys.argv[1]).version==4' "$public_ip"
    nginx_backup="/var/backups/explore-shoot/nginx-before-$release-$stamp.conf"
    cp -- /etc/nginx/sites-available/explore-shoot "$nginx_backup"
    sed "s/__PUBLIC_IP__/$public_ip/g" "$target/tools/deploy/nginx-ip.conf.template" > /etc/nginx/sites-available/explore-shoot
    nginx -t
    systemctl reload nginx
fi
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
