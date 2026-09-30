#!/usr/bin/env bash
# Install container runtime. Does not switch traffic or stop the existing API.
set -euo pipefail
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg rsync python3
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker azureuser
sudo install -d -o azureuser -g azureuser -m 750 /srv/echo/containers /srv/echo/backups
# Caddy already exists on the current VM. New hosts also need Caddy and DNS/TLS setup.
sudo docker version --format '{{.Server.Version}}'
sudo docker compose version

# This VM has 892 MiB RAM. Swap covers short deployment peaks; containers are capped.
if ! sudo swapon --show=NAME --noheadings | grep -q '^/swapfile-echo$'; then
    if [ ! -e /swapfile-echo ]; then
        sudo fallocate -l 1G /swapfile-echo
        sudo chmod 600 /swapfile-echo
        sudo mkswap /swapfile-echo
    fi
    sudo swapon /swapfile-echo
fi
if ! grep -q '^/swapfile-echo ' /etc/fstab; then
    printf '%s\n' '/swapfile-echo none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
