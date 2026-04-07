# Update Banner — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

## Overview

Poll the Replicated SDK's `/app/updates` endpoint every minute and show a global banner whenever an update is available. The banner is visible on all pages.

## Architecture

Three pieces:

1. **`GET /api/updates` route** — server-side proxy to `${REPLICATED_SDK_URL}/api/v1/app/updates`. Returns the array from the SDK, or `[]` if `REPLICATED_SDK_URL` is unset or the call fails.
2. **`UpdateBanner` component** (`src/components/UpdateBanner.tsx`) — client component that polls `/api/updates` every 60s via `setInterval`. First poll fires immediately on mount. Renders the banner when the response array is non-empty.
3. **`layout.tsx`** — mounts `<UpdateBanner />` inside `<body>`, above `<Providers>`.

## API Route

**File:** `src/app/api/updates/route.ts`

- `GET` handler
- Reads `REPLICATED_SDK_URL` from `process.env`
- If unset, returns `[]`
- Fetches `${REPLICATED_SDK_URL}/api/v1/app/updates`
- On success, returns the parsed JSON array
- On any error, logs with `console.error` and returns `[]`
- Never throws — always returns a valid JSON array

## UpdateBanner Component

**File:** `src/components/UpdateBanner.tsx`

- `'use client'`
- State: `update: { versionLabel: string; releaseNotes: string } | null`, initialised to `null`
- `useEffect` sets up `setInterval` (60s), fires immediately on mount via a helper function, clears interval on unmount
- On each poll: `fetch('/api/updates')`, parse JSON, set `update` to first item if array non-empty, otherwise leave state unchanged (preserves banner on transient failures)
- Renders nothing when `update` is `null`
- Banner: full-width fixed bar at top, `text-yellow-400 bg-black border-b border-yellow-400`, font-mono
- Content: `UPDATE AVAILABLE: v{versionLabel} — {releaseNotes}`

## Banner Styling

Matches the app's retro terminal aesthetic:

```
[ UPDATE AVAILABLE: v0.1.15 — Awesome new features! ]
```

- Fixed at top of screen, full width, `z-50`
- `text-yellow-400` to stand out from the green UI
- `bg-black border-b border-yellow-400`
- `font-mono text-xs text-center py-2 px-4`
- No dismiss button — persists until the update is applied (next poll returns `[]`)

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `REPLICATED_SDK_URL` unset (local dev) | API route returns `[]`, no banner |
| SDK unreachable / error | API route logs error, returns `[]`, no banner |
| Client poll fails (network hiccup) | Current `update` state preserved, banner stays if already showing |

## Layout Change

`src/app/layout.tsx` — add `<UpdateBanner />` as first child inside `<body>`, before `<Providers>`. No auth required; banner is intentionally visible on all pages including login/signup.

## Testing

No unit tests. The component is a thin polling wrapper around a fetch call with straightforward error handling. Verified manually by deploying to a CMX cluster and confirming the banner appears when a new release is available in the Vendor Portal.
