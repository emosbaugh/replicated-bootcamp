# License Validity & Expiry Checking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every request behind a Replicated SDK license check, blocking with a clear reason when the license is expired, unreachable, or invalid.

**Architecture:** A `src/lib/license.ts` module fetches `/api/v1/license/info` from the SDK sidecar and caches the result for 60 seconds. Next.js `middleware.ts` calls it on every request and rewrites to `/license-error` when the license is not valid. A new server component at `src/app/license-error/page.tsx` displays the reason.

**Tech Stack:** Next.js 16.2.2 (App Router), TypeScript, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/license.ts` | Create | SDK call, expiry logic, 60s cache |
| `src/lib/license.test.ts` | Create | Unit tests for all license check cases |
| `middleware.ts` | Create | Request gate — calls checkLicense, rewrites on block |
| `src/app/license-error/page.tsx` | Create | Blocking error screen with reason |

---

### Task 1: License checking module (TDD)

**Files:**
- Create: `src/lib/license.test.ts`
- Create: `src/lib/license.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/license.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkLicense, _resetCacheForTesting } from './license'

beforeEach(() => {
  _resetCacheForTesting()
  vi.stubEnv('REPLICATED_SDK_URL', 'http://replicated:3000')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('checkLicense', () => {
  it('returns invalid when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const result = await checkLicense()
    expect(result).toEqual({ valid: false, reason: 'License service not configured' })
  })

  it('returns invalid when fetch throws (service unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))
    const result = await checkLicense()
    expect(result).toEqual({ valid: false, reason: 'License service unreachable' })
  })

  it('returns invalid when SDK returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const result = await checkLicense()
    expect(result).toEqual({ valid: false, reason: 'License service unreachable' })
  })

  it('returns invalid when expires_at is a past date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entitlements: { expires_at: { value: '2020-01-01T00:00:00Z' } },
      }),
    }))
    const result = await checkLicense()
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toMatch(/^License expired on /)
  })

  it('returns valid when expires_at is empty string (no expiry set)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entitlements: { expires_at: { value: '' } },
      }),
    }))
    const result = await checkLicense()
    expect(result).toEqual({ valid: true })
  })

  it('returns valid when expires_at is a future date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entitlements: { expires_at: { value: '2099-01-01T00:00:00Z' } },
      }),
    }))
    const result = await checkLicense()
    expect(result).toEqual({ valid: true })
  })

  it('caches the result — second call within TTL does not fetch again', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: '' } } }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await checkLicense()
    await checkLicense()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/lib/license.test.ts
```

Expected: FAIL — `checkLicense` and `_resetCacheForTesting` are not defined.

- [ ] **Step 3: Implement `src/lib/license.ts`**

Create `src/lib/license.ts`:

```ts
export type LicenseStatus = { valid: true } | { valid: false; reason: string }

interface CacheEntry {
  status: LicenseStatus
  cachedAt: number
}

const CACHE_TTL_MS = 60_000
let cache: CacheEntry | null = null

export function _resetCacheForTesting(): void {
  cache = null
}

export async function checkLicense(): Promise<LicenseStatus> {
  const now = Date.now()
  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache.status
  }

  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) {
    const status: LicenseStatus = { valid: false, reason: 'License service not configured' }
    cache = { status, cachedAt: now }
    return status
  }

  let status: LicenseStatus
  try {
    const res = await fetch(`${sdkUrl}/api/v1/license/info`)
    if (!res.ok) {
      status = { valid: false, reason: 'License service unreachable' }
    } else {
      const data = await res.json()
      const expiresAt: string = data?.entitlements?.expires_at?.value ?? ''
      if (expiresAt && new Date(expiresAt) < new Date()) {
        const formatted = new Date(expiresAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        status = { valid: false, reason: `License expired on ${formatted}` }
      } else {
        status = { valid: true }
      }
    }
  } catch {
    status = { valid: false, reason: 'License service unreachable' }
  }

  cache = { status, cachedAt: now }
  return status
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/lib/license.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/license.ts src/lib/license.test.ts
git commit -m "feat: add license checking module with 60s cache"
```

---

### Task 2: Middleware gate

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts` at the project root**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { checkLicense } from '@/lib/license'

export async function middleware(req: NextRequest) {
  const status = await checkLicense()
  if (status.valid) {
    return NextResponse.next()
  }
  const url = new URL('/license-error', req.url)
  url.searchParams.set('reason', status.reason)
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!license-error|_next|favicon.ico).*)'],
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS (middleware has no unit tests — it is thin glue over `checkLicense` which is fully tested).

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add license middleware gate for all routes"
```

---

### Task 3: License error page

**Files:**
- Create: `src/app/license-error/page.tsx`

- [ ] **Step 1: Create the error page**

Create `src/app/license-error/page.tsx`:

```tsx
export default async function LicenseErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const message = reason ?? 'License invalid'

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
      <pre className="font-mono text-green-400 text-xl">{`⚾  PLAYBALL.EXE  ⚾`}</pre>
      <pre className="font-mono text-red-400 text-lg">LICENSE ERROR</pre>
      <pre className="font-mono text-red-300 text-sm">{message}</pre>
      <pre className="font-mono text-green-600 text-xs">
        Contact your administrator to renew your license.
      </pre>
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/license-error/page.tsx
git commit -m "feat: add license error blocking page"
```

---

## Verification

After all tasks are complete, verify the full build passes:

```bash
docker build -f deploy/Dockerfile .
helm lint deploy/charts --set nextauth.secret=test
```

Both must succeed before pushing.
