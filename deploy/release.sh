#!/usr/bin/env bash
# Usage: release.sh <image-sha> [compose-project]
# Runs from its own directory: /srv/echo/containers (project "echo", production)
# or /srv/echo-stage/containers (project "echo-stage"). Images and
# compose.release.yml are uploaded next to it by CI; backups go to ../backups.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
release="${1:?image tag required}"
project="${2:-echo}"
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release tag'; exit 1; }
[[ "$project" =~ ^[a-z0-9-]+$ ]] || { echo 'Invalid project name'; exit 1; }
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
test -f .env
# The initial SQLite cutover is intentionally an explicit one-time operation.
test -f .postgres-ready || { echo 'Complete the SQLite migration before enabling container deploys'; exit 1; }
port="$(sed -n 's/^WEB_PORT=//p' .env | tail -n 1)"
port="${port:-8080}"
compose() { docker compose -p "$project" --env-file .env "$@"; }
previous="$(cat .release 2>/dev/null || true)"
docker load -i images.tar.gz
compose -f compose.release.yml pull postgres
if [ -f compose.yml ]; then
    cp compose.yml compose.previous.yml
    # The dump contains accounts and session hashes. Keep it private.
    (umask 077; IMAGE_TAG="$previous" compose -f compose.yml exec -T postgres pg_dump -U echo -d echo -Fc > "../backups/pre-${release}.dump")
fi
if IMAGE_TAG="$release" compose -f compose.release.yml up -d --no-build --wait --wait-timeout 120 &&
   curl -fsS --retry 5 --retry-delay 2 --retry-connrefused "http://127.0.0.1:${port}/api/health"; then
    cp compose.release.yml compose.yml
    printf '%s\n' "$release" > .release
    echo "Deployed $release ($project)"
else
    echo 'Deployment failed; restoring previous application images'
    if [ -n "$previous" ] && [ -f compose.previous.yml ]; then
        IMAGE_TAG="$previous" compose -f compose.previous.yml up -d --no-build --wait --wait-timeout 120
    fi
    exit 1
fi
