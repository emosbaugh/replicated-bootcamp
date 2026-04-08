# Support Bundle Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/support` page with a "Generate Support Bundle" button that triggers the Replicated SDK to collect and upload a support bundle to the Vendor Portal.

**Architecture:** A new `POST /api/support-bundle` route proxies to `${REPLICATED_SDK_URL}/api/v1/app/supportbundle`. A new `/support` client page renders the button and inline status feedback. The game page gets a "SUPPORT ->" navigation link in both its pre-game and in-game nav states.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, Vitest

---

### Task 1: Write failing tests for the support-bundle API route

**Files:**
- Create: `src/app/api/support-bundle/route.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// src/app/api/support-bundle/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

beforeEach(() => {
  vi.stubEnv('REPLICATED_SDK_URL', 'http://replicated:3000')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/support-bundle', () => {
  it('returns 503 when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const res = await POST()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ error: 'SDK not configured' })
  })

  it('returns 200 when SDK returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://replicated:3000/api/v1/app/supportbundle',
      { method: 'POST' }
    )
  })

  it('returns the SDK status when SDK returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const res = await POST()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ error: 'Failed to generate support bundle' })
  })

  it('returns 500 when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Failed to generate support bundle' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/api/support-bundle/route.test.ts`

Expected: FAIL — `Cannot find module './route'`

---

### Task 2: Implement the support-bundle API route

**Files:**
- Create: `src/app/api/support-bundle/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/support-bundle/route.ts
import { NextResponse } from 'next/server'

export async function POST() {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) {
    return NextResponse.json({ error: 'SDK not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${sdkUrl}/api/v1/app/supportbundle`, { method: 'POST' })
    if (!res.ok) {
      console.error('[support-bundle] SDK returned', res.status)
      return NextResponse.json(
        { error: 'Failed to generate support bundle' },
        { status: res.status }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[support-bundle] failed to generate bundle', err)
    return NextResponse.json(
      { error: 'Failed to generate support bundle' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/app/api/support-bundle/route.test.ts`

Expected: All 4 tests PASS

- [ ] **Step 3: Run the full test suite to check for regressions**

Run: `npm test`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/api/support-bundle/route.ts src/app/api/support-bundle/route.test.ts
git commit -m "feat: add POST /api/support-bundle route proxying to SDK"
```

---

### Task 3: Create the support page

**Files:**
- Create: `src/app/support/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/support/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type BundleStatus = 'idle' | 'loading' | 'success' | 'error'

export default function SupportPage() {
  const { status } = useSession()
  const router = useRouter()
  const [bundleStatus, setBundleStatus] = useState<BundleStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  async function handleGenerateBundle() {
    setBundleStatus('loading')
    setErrorMessage('')
    try {
      const res = await fetch('/api/support-bundle', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setErrorMessage(data.error ?? 'Failed to generate bundle. Check SDK connectivity.')
        setBundleStatus('error')
        return
      }
      setBundleStatus('success')
    } catch {
      setErrorMessage('Failed to generate bundle. Check SDK connectivity.')
      setBundleStatus('error')
    }
  }

  return (
    <div>
      <div className="flex justify-between p-4">
        <button
          onClick={() => router.push('/game')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          &lt;- BACK TO GAME
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          LOGOUT
        </button>
      </div>
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <pre className="font-mono text-green-400 text-center">{[
          '╔══════════════════════════════════════╗',
          '║             [ SUPPORT ]              ║',
          '╚══════════════════════════════════════╝',
        ].join('\n')}</pre>
        <button
          onClick={handleGenerateBundle}
          disabled={bundleStatus === 'loading'}
          className="border border-green-400 text-green-400 font-mono px-8 py-3 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {bundleStatus === 'loading' ? '  COLLECTING...  ' : '  GENERATE SUPPORT BUNDLE  '}
        </button>
        {bundleStatus === 'success' && (
          <pre className="font-mono text-green-400 text-xs">
            Support bundle uploaded to Vendor Portal.
          </pre>
        )}
        {bundleStatus === 'error' && (
          <pre className="font-mono text-yellow-400 text-xs">
            {errorMessage || 'Failed to generate bundle. Check SDK connectivity.'}
          </pre>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite to check for regressions**

Run: `npm test`

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/support/page.tsx
git commit -m "feat: add /support page with Generate Support Bundle action"
```

---

### Task 4: Add SUPPORT navigation link to game page

**Files:**
- Modify: `src/app/game/page.tsx`

The game page has two nav states that both need a "SUPPORT ->" link:
1. **Pre-game state** (no `gameState`): centered button stack, lines 96–119
2. **In-game state**: top nav bar, lines 123–147

- [ ] **Step 1: Add SUPPORT link to the pre-game nav (between "VIEW ROSTER + STATS" and "LOGOUT")**

In `src/app/game/page.tsx`, find this block (lines 107–117):

```tsx
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          VIEW ROSTER + STATS -&gt;
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          LOGOUT
        </button>
```

Replace with:

```tsx
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          VIEW ROSTER + STATS -&gt;
        </button>
        <button
          onClick={() => router.push('/support')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          SUPPORT -&gt;
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          LOGOUT
        </button>
```

- [ ] **Step 2: Add SUPPORT link to the in-game top nav (alongside "ROSTER / STATS")**

In `src/app/game/page.tsx`, find this block (lines 124–130):

```tsx
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          ROSTER / STATS -&gt;
        </button>
```

Replace with:

```tsx
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/stats')}
            className="font-mono text-xs text-green-600 hover:text-green-400"
          >
            ROSTER / STATS -&gt;
          </button>
          <button
            onClick={() => router.push('/support')}
            className="font-mono text-xs text-green-600 hover:text-green-400"
          >
            SUPPORT -&gt;
          </button>
        </div>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/game/page.tsx
git commit -m "feat: add SUPPORT nav link to game page"
```
