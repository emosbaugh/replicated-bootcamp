# License Expiry Warning: Periodic Log + Support Bundle Analyzer

**Date:** 2026-04-08

## Problem

The support bundle spec has no analyzers. A license approaching expiry is a high-impact failure mode — the app blocks all users with a license error page once it expires — but there is no way for support to spot this from a collected bundle.

## Solution

Two changes:

1. **App:** Add a periodic background check that logs a structured warning when the license expires within 7 days.
2. **Support bundle:** Add a `textAnalyze` analyzer that searches those logs and surfaces an actionable message if the warning is present.

## App Change — `src/instrumentation.ts`

Next.js calls `register()` in `instrumentation.ts` once per server process at startup. This is the idiomatic place for background tasks that must not touch request handling.

- Call `register()` which starts a `setInterval` at 1-hour cadence.
- Also fires once immediately at startup so the warning appears in logs even on long-running pods.
- Reuses the existing SDK fetch logic (same `REPLICATED_SDK_URL` env var, same `expires_at` entitlement field already parsed in `license.ts`).
- If the SDK is unreachable or returns no expiry, the check is a no-op (no extra noise).
- If expiry is within 7 days, logs:

```
[license] warning: expires in <N> days (<YYYY-MM-DD>)
```

## Support Bundle Analyzer

Add an `analyzers` section to `deploy/charts/templates/support-bundle.yaml`:

```yaml
analyzers:
  - textAnalyze:
      checkName: "License Expiry Warning"
      fileName: app/**/*.log
      regex: '\[license\] warning: expires in'
      outcomes:
        - fail:
            when: "true"
            message: >
              Your license expires within 7 days. Renew it before expiry to
              avoid service interruption:
              https://vendor.replicated.com
        - pass:
            when: "false"
            message: "License is not approaching expiry."
```

- `fileName: app/**/*.log` matches all container logs from the `app` log collector.
- The regex is narrow enough to avoid false positives from other log lines.

## What Is Not In Scope

- Changing the existing `checkLicense()` expiry logic or its cache.
- Adding UI-level warnings (the existing license error page already handles the expired state).
- Multiple thresholds (e.g., 30-day warning) — one 7-day threshold keeps it simple.
