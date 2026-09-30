#!/usr/bin/env bash
# One-time cutover, after loading the two tested images and creating .env.
set -euo pipefail
cd /srv/echo/containers
release="${1:?image tag required}"
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || exit 1
export IMAGE_TAG="$release"
exec 9>.deploy.lock
flock -n 9
[ ! -e .postgres-ready ] || { echo 'Migration already completed'; exit 1; }
[ ! -e .sqlite-imported ] || { echo 'Previous import exists; inspect before retrying cutover'; exit 1; }
test -f .env
test -f /srv/echo/data/echo.db
sudo systemctl is-active --quiet echo-api
docker compose -f compose.yml up -d --no-build --wait postgres
# Validate the candidate proxy before stopping the old API.
sudo caddy validate --config Caddyfile
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/srv/echo/backups/sqlite-${stamp}"
mkdir -m 700 "$backup"
sudo cp /etc/caddy/Caddyfile "$backup/Caddyfile"
restore_old() {
    echo 'Cutover failed; restoring SQLite service and original proxy'
    sudo cp "$backup/Caddyfile" /etc/caddy/Caddyfile
    sudo systemctl start echo-api
    sudo systemctl reload caddy
}
trap restore_old ERR
sudo systemctl stop echo-api
# Preserve the original database and a verified logical snapshot, including session hashes.
python3 export-sqlite.py /srv/echo/data/echo.db "$backup/echo.db" > "$backup/snapshot.json"
chmod 600 "$backup/snapshot.json"
chmod 600 "$backup/echo.db"
docker compose -f compose.yml run --rm -T --no-deps api node --import tsx scripts/import-sqlite.ts < "$backup/snapshot.json"
printf '%s\n' "$backup" > .sqlite-imported
docker compose -f compose.yml up -d --no-build --wait --wait-timeout 120
curl -fsS --retry 5 --retry-delay 2 --retry-connrefused http://127.0.0.1:8080/api/health
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsS --retry 5 --retry-delay 2 https://vencera.jeanark.dev/api/health
sudo systemctl disable echo-api
printf '%s\n' "$release" > .release
touch .postgres-ready
trap - ERR
echo "PostgreSQL cutover complete; SQLite backup: $backup"
