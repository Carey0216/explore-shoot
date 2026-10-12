#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y openjdk-21-jre-headless nginx unzip python3-venv python3-pip curl ca-certificates libgomp1 espeak-ng
if ! id explore-shoot >/dev/null 2>&1; then
  useradd --system --home /var/lib/explore-shoot --shell /usr/sbin/nologin explore-shoot
fi
install -d -m 755 /opt/explore-shoot/releases /opt/explore-shoot/incoming /etc/explore-shoot /usr/local/libexec
install -d -m 750 -o explore-shoot -g explore-shoot /var/lib/explore-shoot /var/lib/explore-shoot/data /var/lib/explore-shoot/runtime /var/lib/explore-shoot/runtime/tools-bin
install -d -m 700 /var/backups/explore-shoot
install -d -m 755 /var/www/explore-shoot-acme/.well-known/acme-challenge
if [ ! -f /etc/explore-shoot/server.env ]; then
  umask 077
  {
    echo 'EXPLORE_PROJECT_ROOT=/opt/explore-shoot/current'
    echo 'EXPLORE_DATA_DIR=/var/lib/explore-shoot/data'
    echo 'PORT=4174'
    echo 'ADMIN_PORT=4176'
    echo 'EXPLORE_VOICE_WARMUP=1'
    printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    echo 'OMP_NUM_THREADS=2'
    echo 'OPENBLAS_NUM_THREADS=2'
  } > /etc/explore-shoot/server.env
fi
if ! swapon --noheadings --show | grep -q . && [ ! -e /swap-explore-shoot ]; then
  fallocate -l 2G /swap-explore-shoot
  chmod 600 /swap-explore-shoot
  mkswap /swap-explore-shoot
  swapon /swap-explore-shoot
  printf '/swap-explore-shoot none swap sw 0 0\n' >> /etc/fstab
fi
if [ ! -x /opt/explore-shoot-certbot/bin/certbot ]; then
  python3 -m venv /opt/explore-shoot-certbot
  /opt/explore-shoot-certbot/bin/pip install 'certbot>=5.4,<6'
fi
java -version
/opt/explore-shoot-certbot/bin/certbot --version
echo 'Ubuntu runtime ready; no application or data overwritten.'
