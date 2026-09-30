#!/usr/bin/env bash
# Run from /srv/echo/containers. Images and compose.release.yml are uploaded by CI.
set -euo pipefail
cd /srv/echo/containers
release="${1:?image tag required}"
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release tag'; exit 1; }
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
test -f .env
# The initial SQLite cutover is intentionally an explicit one-time operation.
test -f .postgres-ready || { echo 'Complete the SQLite migration before enabling container deploys'; exit 1; }
previous="$(cat .release 2>/dev/null || true)"
docker load -i images.tar.gz
docker compose --env-file .env -f compose.release.yml pull postgres
if [ -f compose.yml ]; then
    cp compose.yml compose.previous.yml
    # The dump contains accounts and session hashes. Keep it private.
    (umask 077; IMAGE_TAG="$previous" docker compose --env-file .env -f compose.yml exec -T postgres pg_dump -U echo -d echo -Fc > "/srv/echo/backups/pre-${release}.dump")
fi
if IMAGE_TAG="$release" docker compose --env-file .env -f compose.release.yml up -d --no-build --wait --wait-timeout 120 &&
   curl -fsS --retry 5 --retry-delay 2 --retry-connrefused http://127.0.0.1:8080/api/health; then
    cp compose.release.yml compose.yml
    printf '%s\n' "$release" > .release
    echo "Deployed $release"
else
    echo 'Deployment failed; restoring previous application images'
    if [ -n "$previous" ] && [ -f compose.previous.yml ]; then
        IMAGE_TAG="$previous" docker compose --env-file .env -f compose.previous.yml up -d --no-build --wait --wait-timeout 120
    fi
    exit 1
fi
