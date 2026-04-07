# Custom Metrics — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

## Overview

Send meaningful app-activity metrics to the Replicated Vendor Portal via the Replicated SDK's custom metrics API. Metrics reflect real user and game activity — no synthetic data.

## Metrics

Four gauge values sent as a single snapshot each time any tracked event fires:

| Key | Description |
|-----|-------------|
| `users_total` | Total registered users (COUNT from User table) |
| `games_completed` | Total completed games across all users |
| `games_won` | Games where result = `user_win` |
| `games_lost` | Games where result = `cpu_win` |

## New Module

`src/lib/metrics.ts` — exports a single function:

```ts
export async function sendCustomMetrics(): Promise<void>
```

- Runs 2 Prisma queries: `User` count and `Game` result counts
- POSTs to `${REPLICATED_SDK_URL}/api/v1/app/custom-metrics`
- Catches all errors and logs them — never throws
- No-ops silently if `REPLICATED_SDK_URL` is unset (local dev)

## Call Sites

| Event | File | Location |
|-------|------|----------|
| User signup | `src/app/api/auth/register/route.ts` | After user created |
| User login | `src/lib/auth.ts` (NextAuth `authorize`) | After credentials verified |
| Game completion | `src/lib/game-end.ts` (`finalizeGame`) | After season stats updated |

## Environment Variable

`REPLICATED_SDK_URL` — set to `http://playball-exe-sdk:3000` in cluster via Helm secret template. Not required locally; function no-ops if SDK is unreachable.

## Helm Changes

Add `REPLICATED_SDK_URL` to `deploy/charts/templates/secret.yaml`, templated to the SDK service URL.

## Error Handling

All SDK call failures are caught and logged with `console.error`. A failed metrics push must never interrupt user-facing flows (auth, gameplay).

## Testing

No new unit tests. Metrics call is a fire-and-forget side effect with catch-all error handling. Verified by inspecting Vendor Portal Instance Details page after deploying to a CMX cluster.
