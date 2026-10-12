#!/usr/bin/env bash
set -euo pipefail
ip=${1:?Provide the instance public IPv4 address}
python3 -c 'import ipaddress,sys; assert ipaddress.ip_address(sys.argv[1]).version==4' "$ip"
template=${2:?Provide nginx-ip.conf.template path}
test "$(id -u)" = 0
if [ -L /etc/nginx/sites-enabled/default ]; then unlink /etc/nginx/sites-enabled/default; fi
if [ ! -f "/etc/letsencrypt/live/$ip/fullchain.pem" ]; then
    cat > /etc/nginx/sites-available/explore-shoot-acme <<EOF
server {
    listen 80;
    server_name $ip;
    location ^~ /.well-known/acme-challenge/ { root /var/www/explore-shoot-acme; }
    location / { return 503; }
}
EOF
    ln -sf /etc/nginx/sites-available/explore-shoot-acme /etc/nginx/sites-enabled/explore-shoot-acme
    nginx -t
    systemctl reload nginx
    /opt/explore-shoot-certbot/bin/certbot certonly --non-interactive --agree-tos \
        --register-unsafely-without-email --required-profile shortlived --webroot \
        --webroot-path /var/www/explore-shoot-acme --ip-address "$ip" --cert-name "$ip"
fi
sed "s/__PUBLIC_IP__/$ip/g" "$template" > /etc/nginx/sites-available/explore-shoot
ln -sf /etc/nginx/sites-available/explore-shoot /etc/nginx/sites-enabled/explore-shoot
if [ -L /etc/nginx/sites-enabled/explore-shoot-acme ]; then unlink /etc/nginx/sites-enabled/explore-shoot-acme; fi
nginx -t
systemctl reload nginx
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nset -e\n/usr/sbin/nginx -t\n/bin/systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/explore-shoot-nginx
chmod 750 /etc/letsencrypt/renewal-hooks/deploy/explore-shoot-nginx
cat > /etc/systemd/system/explore-shoot-cert-renew.service <<'EOF'
[Unit]
Description=Renew short-lived IP HTTPS certificate
[Service]
Type=oneshot
ExecStart=/opt/explore-shoot-certbot/bin/certbot renew --quiet
EOF
cat > /etc/systemd/system/explore-shoot-cert-renew.timer <<'EOF'
[Unit]
Description=Check IP HTTPS renewal twice daily
[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=1800
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now explore-shoot-cert-renew.timer
openssl x509 -in "/etc/letsencrypt/live/$ip/fullchain.pem" -noout -dates -ext subjectAltName
