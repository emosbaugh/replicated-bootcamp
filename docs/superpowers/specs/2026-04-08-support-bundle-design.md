# Support Bundle Generation Feature Design

**Date:** 2026-04-08
**Status:** Approved

## Overview

Add a "Generate Support Bundle" action to the playball.exe app UI. Triggering it collects a support bundle and uploads it to the Replicated Vendor Portal automatically via the Replicated SDK. The bundle then appears on the Instance Details page in the Vendor Portal.

## Architecture

### New files

- `src/app/support/page.tsx` — dedicated support page (client component)
- `src/app/api/support-bundle/route.ts` — API route proxying to the SDK

### Changed files

- `src/app/game/page.tsx` — add a link to `/support` alongside the existing "View Roster + Stats" link

### Data flow

1. User clicks "Generate Support Bundle" on `/support`
2. Client POSTs to `/api/support-bundle`
3. API route POSTs to `${REPLICATED_SDK_URL}/api/v1/app/supportbundle`
4. SDK collects the bundle and uploads it to the Vendor Portal
5. API route returns the SDK response (success or error) to the client
6. UI updates to show success or error state

No new database models are needed. The SDK owns storage and upload.

## UI

`/support` is a single client component following the existing retro terminal aesthetic (`bg-black`, `text-green-400`, `font-mono`).

**Layout:**
- `← Back to Game` nav link at top (matches `/stats` back-nav pattern)
- ASCII-box header: `[ SUPPORT ]`
- "Generate Support Bundle" action button (matches existing button styling)
- Status area below the button:
  - **Idle:** no message
  - **Loading:** "Collecting support bundle..." with a blinking cursor
  - **Success:** "Support bundle uploaded to Vendor Portal."
  - **Error:** error message in amber/red

No new shared components needed. All UI lives in `page.tsx`.

## API Route

`POST /api/support-bundle`

```
if REPLICATED_SDK_URL is not set:
  return 503 { error: "SDK not configured" }

POST ${REPLICATED_SDK_URL}/api/v1/app/supportbundle

if SDK returns non-2xx:
  return same status { error: "Failed to generate support bundle" }

return 200 { ok: true }
```

No request body is required by the SDK endpoint. No authentication check is added beyond the existing license middleware that already gates all routes.

## Error Handling

| Scenario | API response | UI message |
|---|---|---|
| `REPLICATED_SDK_URL` not set | 503 | "Failed to generate bundle. Check SDK connectivity." |
| SDK returns non-2xx | forwarded status | "Failed to generate bundle. Check SDK connectivity." |
| Network / fetch error | 500 | "Failed to generate bundle. Check SDK connectivity." |

The UI always transitions out of loading state on any error — no stuck spinners.

## Testing

Unit tests for `src/app/api/support-bundle/route.ts`:

- When `REPLICATED_SDK_URL` is not set, returns 503
- When SDK returns 200, returns 200 `{ ok: true }`
- When SDK returns non-2xx, returns same status with error body
- Verifies the route calls the correct SDK URL (`/api/v1/app/supportbundle`)

Pattern follows `src/lib/license.test.ts` — mock `fetch` globally, assert on calls and responses.

## Out of Scope

- Gating this page behind a license entitlement (support should always be accessible)
- Displaying a list of previously generated bundles in the UI (Vendor Portal is the source of truth)
- Polling for bundle upload status (the SDK call is synchronous from the app's perspective)
