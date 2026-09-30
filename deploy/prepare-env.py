#!/usr/bin/env python3
"""Reuse the existing mail configuration without printing secrets or overwriting an env."""
import os
from pathlib import Path
import secrets
import shlex

path = Path('/srv/echo/containers/.env')
if path.exists():
    raise SystemExit('Container .env already exists; kept unchanged.')
legacy = {}
for line in Path('/srv/echo/api/.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        legacy[key] = ' '.join(shlex.split(value))
values = {
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'NODE_ENV': 'production',
    'PUBLIC_ORIGIN': 'https://vencera.jeanark.dev',
    'RESEND_API_KEY': legacy.get('RESEND_API_KEY', ''),
    'MAIL_FROM': legacy.get('MAIL_FROM', 'ECHO <echo@vencera.jeanark.dev>'),
    'WEB_PORT': '8080',
}
with os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'w') as output:
    for key, value in values.items():
        output.write(f'{key}={shlex.quote(value)}\n')
print('Container environment created with mode 600; existing mail key preserved.')
