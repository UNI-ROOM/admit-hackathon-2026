#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg rsync build-essential python3
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y caddy nodejs
sudo install -d -o azureuser -g azureuser /srv/echo/web /srv/echo/api /srv/echo/data /srv/echo/shared
sudo install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo install -m 644 deploy/echo-api.service /etc/systemd/system/echo-api.service
sudo systemctl daemon-reload
sudo systemctl enable echo-api
printf '%s\n' 'azureuser ALL=(root) NOPASSWD: /usr/bin/systemctl restart echo-api' | sudo tee /etc/sudoers.d/echo >/dev/null
sudo chmod 440 /etc/sudoers.d/echo
sudo visudo -cf /etc/sudoers.d/echo
if [ ! -f /srv/echo/api/.env ]; then
    (umask 077; printf '%s\n' 'NODE_ENV=production' 'PUBLIC_ORIGIN=https://vencera.jeanark.dev' 'DB_PATH=/srv/echo/data/echo.db' 'PORT=3000' 'MAIL_FROM=ECHO <echo@jeanark.dev>' > /srv/echo/api/.env)
fi
