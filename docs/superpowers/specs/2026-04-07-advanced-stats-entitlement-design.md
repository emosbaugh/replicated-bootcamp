# Design: advanced_stats_enabled Entitlement Gate

**Date:** 2026-04-07
**Feature:** Gate the `/stats` page behind a Replicated license entitlement field

---

## Overview

Add a `advanced_stats_enabled` boolean entitlement check to the stats page. Users whose license has this field set to `false` (or who are running without a Replicated SDK connection) see an upgrade message instead of their team stats.

---

## Architecture

### 1. `src/lib/license.ts` — License utility

A server-side utility that fetches a named license field from the Replicated SDK.

```
getLicenseField(name: string): Promise<string | boolean | null>
```

- Calls `GET {REPLICATED_SDK_URL}/api/v1/license/fields/{name}`
- Returns the field's `value` from the response body on success
- Returns `null` if `REPLICATED_SDK_URL` is unset or the request fails (fail closed)

### 2. `src/app/api/license/fields/[field]/route.ts` — Proxy API route

A GET route that exposes a single license field value to client components without leaking `REPLICATED_SDK_URL` or SDK internals to the browser.

**Response shape:**
```json
{ "enabled": true | false }
```

- Calls `getLicenseField(params.field)`
- Returns `{ enabled: true }` if the value is the string `"true"` or boolean `true`
- Returns `{ enabled: false }` for all other values including `null` (fail closed)

### 3. `src/app/stats/page.tsx` — Stats page update

The existing client component fetches `/api/license/fields/advanced_stats_enabled` alongside the existing `/api/roster` call. Both fetches happen in parallel in the `useEffect`.

**State additions:**
- `advancedStatsEnabled: boolean | null` — `null` while loading, `true`/`false` after fetch

**Render logic:**
- While loading (either `roster === null` or `advancedStatsEnabled === null`): show existing `LOADING ROSTER...` state
- If `enabled === false`: render an ASCII-art upgrade message in place of `<AsciiStats />`
- If `enabled === true`: render `<AsciiStats />` as today

**Upgrade message** (matches terminal aesthetic):
```
╔══════════════════════════════════════╗
║      ADVANCED STATS: LOCKED          ║
║                                      ║
║  This feature requires an upgraded   ║
║  license. Contact your vendor to     ║
║  enable advanced stats.              ║
╚══════════════════════════════════════╝
```

---

## Failure Behavior

| Scenario | `getLicenseField` returns | API route returns | Stats page shows |
|---|---|---|---|
| SDK URL unset (local dev) | `null` | `{ enabled: false }` | Upgrade message |
| SDK unreachable / error | `null` | `{ enabled: false }` | Upgrade message |
| Field value is `"true"` | `"true"` | `{ enabled: true }` | Stats |
| Field value is `"false"` | `"false"` | `{ enabled: false }` | Upgrade message |

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/license.ts` | New — `getLicenseField` utility |
| `src/app/api/license/fields/[field]/route.ts` | New — proxy API route |
| `src/app/stats/page.tsx` | Modified — fetch entitlement, conditional render |

---

## Out of Scope

- Caching the entitlement value (SDK calls are already fast)
- Gating other pages or API routes
- Showing different tiers of stats based on license level
