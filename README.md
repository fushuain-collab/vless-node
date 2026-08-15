# vless-node

Cloudflare Workers VLESS deployment and Mihomo subscription artifacts.

## Current production profile

- Main subscription: `yuhe-bettbox-vless.yaml`
- Current main branch: restored stable baseline after the Cloudflare compatibility experiment
- The main profile currently contains 6 endpoints. Historical files containing 20 or 30 endpoints are candidates, not production configuration.
- DNS pollution experiments stay isolated on `test/dns-pollution-doh-20260814` until they pass real phone-side tests.

## Validation

Run the local structural checks before publishing a subscription:

```sh
apk add py3-yaml
python3 tools/validate_subscriptions.py
```

The checker validates YAML syntax, proxy list shape, duplicate names/endpoints, and mismatches between a numeric node count in the title and the actual proxy count. It does not claim that a node works on a phone; real network acceptance still requires mobile testing.

## Repository conventions

- Keep production paths stable because GitHub Actions and client subscription URLs may reference them.
- Treat `final-*`, `bettbox-*`, and `us-plus-*` files as historical or candidate artifacts unless explicitly promoted.
- Put experimental DNS or compatibility changes on a separate branch and preserve the last known-good baseline.
- Do not commit API keys, admin passwords, or other credentials. UUIDs used by the deployed Worker are configuration data and should be rotated if exposed publicly.
