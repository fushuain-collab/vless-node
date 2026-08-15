# Subscription Inventory

Generated from the repository at review time on 2026-08-15.

## Production candidate

| File | YAML | Proxies | Rules | Status |
| --- | ---: | ---: | ---: | --- |
| `yuhe-bettbox-vless.yaml` | pass | 6 | 53 | Main stable profile; requires phone-side acceptance testing |

## Candidate profiles

| Family | Typical proxy count | Notes |
| --- | ---: | --- |
| `bettbox-national20-*` | 20 | Historical rule/DNS variants; do not publish without comparison testing |
| `final-region30-*` | 30 | Regional candidate sets |
| `final-low50-*` | 30 | Low-latency candidate set; latency alone is not acceptance |
| `us-plus-*` | 10-20 | US-oriented candidate sets and ranking outputs |
| `clean-vless-stable2-bettbox.yaml` | 2 | Small stable profile candidate |

## Known cleanup

- `bettbox-mofashi-cf-443only.yaml` had an isolated `d3` line and was repaired on branch `chore/subscription-hygiene-20260815`.
- The main profile title previously claimed 172 nodes while containing 6; the title now reflects the actual count.
- DoH endpoints are not marked good or bad from HTTP GET probes alone. Validate them in the actual Mihomo client on the phone.

## Promotion gate

A candidate should only replace the production profile after:

1. YAML validation passes.
2. Multiple phone-side rounds cover latency, jitter, packet loss, first-byte time, real web/API requests, and a small download.
3. The test covers both daytime and nighttime.
4. The candidate is promoted in a separate commit with its source ranking and test notes.
