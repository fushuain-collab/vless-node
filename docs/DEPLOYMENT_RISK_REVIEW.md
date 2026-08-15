# Deployment Risk Review

Review date: 2026-08-15. This document records repository-level risks found during the subscription hygiene pass. It does not represent a Cloudflare-side configuration audit.

## High priority

- Several manual and emergency workflows can deploy or mutate Cloudflare Workers and Pages. Keep them `workflow_dispatch` only, review the target name and route before running, and do not run them as part of subscription testing.
- Some historical workflows contain hard-coded UUID values and inline subscription payloads. They should be replaced with GitHub secrets or removed before reuse.
- `deploy_asia_workers.yml`, `node.yml`, and `node_asia.yml` generate or publish subscriptions from shell scripts. They should be treated as legacy automation until their generated node list is checked against the current production profile.

## Medium priority

- Worker source is duplicated in the root and `workers/` directory. Changes can drift between deployments. Consolidate to one source plus generated deployment artifacts after confirming which workers are still live.
- Several candidate YAML profiles contain endpoint duplicates under different names. This is not automatically wrong because Cloudflare IP/port variants may be intentional, but it inflates the list and needs phone-side testing before promotion.
- The Pages subscription endpoint could not be verified from this sandbox because its TLS connection ended unexpectedly. Verify it from the phone and from an external browser before relying on it.

## Current boundary

This hygiene branch does not deploy, delete routes, rotate credentials, or replace the main subscription. It only repairs local YAML syntax, documents the production candidate, and adds repeatable validation.
