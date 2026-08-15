#!/usr/bin/env python3
"""Validate Mihomo YAML artifacts without contacting the proxy service."""
from __future__ import annotations

import glob
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: install PyYAML first (apk add py3-yaml)", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
FILES = sorted(ROOT.glob("*.yaml")) + sorted(ROOT.glob("*.yml"))
TITLE_RE = re.compile(r"\b(\d+)\s+nodes?\b", re.I)

def endpoint_key(proxy: dict) -> tuple:
    ws = proxy.get("ws-opts") or {}
    headers = ws.get("headers") or {}
    return (
        proxy.get("type"), proxy.get("server"), proxy.get("port"),
        proxy.get("uuid"), proxy.get("network"), proxy.get("servername"),
        ws.get("path"), headers.get("Host"),
    )

errors = 0
for path in FILES:
    try:
        with path.open(encoding="utf-8-sig") as fh:
            data = yaml.safe_load(fh)
    except Exception as exc:
        print(f"ERROR {path.name}: YAML parse failed: {exc}")
        errors += 1
        continue

    if not isinstance(data, dict):
        print(f"ERROR {path.name}: top-level document is not a mapping")
        errors += 1
        continue

    proxies = data.get("proxies") or []
    if not isinstance(proxies, list):
        print(f"ERROR {path.name}: proxies is not a list")
        errors += 1
        continue

    names = [p.get("name") for p in proxies if isinstance(p, dict)]
    duplicate_names = sorted({n for n in names if names.count(n) > 1 and n})
    keys = [endpoint_key(p) for p in proxies if isinstance(p, dict)]
    duplicate_endpoints = len(keys) - len(set(keys))
    title = ""
    with path.open(encoding="utf-8-sig") as fh:
        first_line = fh.readline().strip()
    match = TITLE_RE.search(first_line)
    if match and int(match.group(1)) != len(proxies):
        print(f"WARN  {path.name}: title says {match.group(1)} nodes, actual {len(proxies)}")
    if duplicate_names:
        print(f"WARN  {path.name}: duplicate names: {', '.join(duplicate_names[:5])}")
    if duplicate_endpoints:
        print(f"WARN  {path.name}: {duplicate_endpoints} duplicate endpoint(s)")
    print(f"OK    {path.name}: proxies={len(proxies)} rules={len(data.get('rules') or [])}")

print(f"\nChecked {len(FILES)} YAML file(s); errors={errors}")
raise SystemExit(1 if errors else 0)
