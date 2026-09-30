#!/usr/bin/env python3
"""Export a consistent SQLite snapshot to stdout. Stop the old API before cutover."""
import json
import sqlite3
import sys

source = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
backup = sqlite3.connect(sys.argv[2] if len(sys.argv) > 2 else ":memory:")
source.backup(backup)
backup.row_factory = sqlite3.Row
result = {}
for table in ("users", "sessions", "login_codes", "runs", "progress"):
    result[table] = [dict(row) for row in backup.execute(f"SELECT * FROM {table}")]
json.dump(result, sys.stdout, ensure_ascii=False)
backup.close()
source.close()
