# License Validity & Expiry Checking Design

**Date:** 2026-04-07

## Goal

The application checks its Replicated license on every request. When the license is expired, the SDK is unreachable, or the license is otherwise invalid, all access is blocked and the user sees a clear reason. Normal operation is unaffected when the license is valid.

## Approach

Next.js middleware (`middleware.ts`) enforces a full gate — pages and API routes alike — from a single location. A `src/lib/license.ts` module encapsulates the SDK call and caches the result for 60 seconds to avoid per-request overhead.

## Components

### `src/lib/license.ts`

Exports `checkLicense(): Promise<LicenseStatus>` where:

```ts
type LicenseStatus =
  | { valid: true }
  | { valid: false; reason: string }
```

Logic:
- `REPLICATED_SDK_URL` not set → `{ valid: false, reason: 'License service not configured' }`
- Network error or non-200 from `GET ${REPLICATED_SDK_URL}/api/v1/license/info` → `{ valid: false, reason: 'License service unreachable' }`
- `entitlements.expires_at.value` is a non-empty ISO date string in the past → `{ valid: false, reason: 'License expired on <formatted date>' }`
- Otherwise → `{ valid: true }`

A module-level cache `{ status: LicenseStatus, cachedAt: number }` is checked first. Results younger than 60 seconds are returned without a fetch.

### `middleware.ts` (project root)

Runs on every request. Uses a `config.matcher` to exclude:
- `/license-error` (avoid redirect loop)
- `/_next/**` (Next.js internals)
- `/favicon.ico`

```ts
export const config = {
  matcher: ['/((?!license-error|_next|favicon.ico).*)'],
}
```

On `valid: true` → `NextResponse.next()`.  
On `valid: false` → `NextResponse.rewrite(new URL('/license-error?reason=<encodeURIComponent(reason)>', req.url))`.

### `src/app/license-error/page.tsx`

Server component. Reads `searchParams.reason` and renders a blocking screen matching the app's black/green monospace aesthetic:

```
⚾  PLAYBALL.EXE  ⚾

LICENSE ERROR

<reason>

Contact your administrator to renew your license.
```

No interactive elements. The page is excluded from the middleware check.

## Data Flow

```
Request → middleware.ts
            │
            ├─ checkLicense() ──→ cache hit? → return cached status
            │                           │
            │                           └─ GET /api/v1/license/info
            │                              (REPLICATED_SDK_URL sidecar)
            │
            ├─ valid: true  → NextResponse.next() → normal route handler
            └─ valid: false → rewrite → /license-error?reason=...
```

## License Expiry Logic

`entitlements.expires_at.value` from the SDK response:
- Empty string `""` → no expiry set → valid
- ISO date string in the **future** → valid
- ISO date string in the **past** → expired, show formatted date in reason

## Error Cases

| Condition | `valid` | `reason` shown to user |
|-----------|---------|------------------------|
| SDK URL not configured | false | `License service not configured` |
| Network error / timeout | false | `License service unreachable` |
| SDK returns non-200 | false | `License service unreachable` |
| `expires_at` is past date | false | `License expired on <date>` |
| `expires_at` empty / future | true | — (normal operation) |

## Normal Operation

When the license is valid, the middleware calls `checkLicense()` (cache hit after the first request within a 60s window), receives `{ valid: true }`, and calls `NextResponse.next()`. No visible effect on the user experience.

## Files Changed

| File | Action |
|------|--------|
| `src/lib/license.ts` | New — license check module with cache |
| `middleware.ts` | New — request gate |
| `src/app/license-error/page.tsx` | New — blocking error screen |
