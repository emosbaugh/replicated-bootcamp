# Advanced Stats Entitlement Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the `/stats` page behind the `advanced_stats_enabled` Replicated license entitlement field, showing an upgrade message when the field is false or the SDK is unreachable.

**Architecture:** A new `getLicenseField` utility reads named fields from the Replicated SDK server-side. A Next.js API route proxies that value to the client without exposing `REPLICATED_SDK_URL`. The stats page fetches this route in parallel with the roster and renders either the stats or an upgrade message.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, Replicated SDK HTTP API

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/license.ts` | Create | Fetch a named license field from Replicated SDK |
| `src/lib/license.test.ts` | Create | Unit tests for `getLicenseField` |
| `src/app/api/license/fields/[field]/route.ts` | Create | Server-side proxy route returning `{ enabled: boolean }` |
| `src/app/stats/page.tsx` | Modify | Fetch entitlement, show upgrade message when disabled |

---

## Task 1: getLicenseField utility

**Files:**
- Create: `src/lib/license.ts`
- Create: `src/lib/license.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/license.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLicenseField } from './license'

describe('getLicenseField', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns null when REPLICATED_SDK_URL is not set', async () => {
    delete process.env.REPLICATED_SDK_URL
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })

  it('returns the field value from the SDK response', async () => {
    process.env.REPLICATED_SDK_URL = 'http://replicated-sdk'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'advanced_stats_enabled', value: 'true' }),
    })
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBe('true')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://replicated-sdk/api/v1/license/fields/advanced_stats_enabled'
    )
  })

  it('returns null when the SDK returns a non-ok response', async () => {
    process.env.REPLICATED_SDK_URL = 'http://replicated-sdk'
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    process.env.REPLICATED_SDK_URL = 'http://replicated-sdk'
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- license.test.ts
```

Expected: 4 failures — `Cannot find module './license'`

- [ ] **Step 3: Implement getLicenseField**

Create `src/lib/license.ts`:

```typescript
export async function getLicenseField(name: string): Promise<string | null> {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return null

  try {
    const res = await fetch(`${sdkUrl}/api/v1/license/fields/${name}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.value ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- license.test.ts
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/license.ts src/lib/license.test.ts
git commit -m "feat: add getLicenseField utility for Replicated SDK license fields"
```

---

## Task 2: License fields API route

**Files:**
- Create: `src/app/api/license/fields/[field]/route.ts`

This route proxies `getLicenseField` to the browser. It keeps `REPLICATED_SDK_URL` server-side and normalises the value to a plain `{ enabled: boolean }` shape. There is no unit test for the route handler itself — it's a thin wrapper with no logic beyond what `getLicenseField` already covers.

- [ ] **Step 1: Create the route**

Create `src/app/api/license/fields/[field]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getLicenseField } from '@/lib/license'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ field: string }> }
) {
  const { field } = await params
  const value = await getLicenseField(field)
  const enabled = value === 'true'
  return NextResponse.json({ enabled })
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (no new tests for the route, existing tests unaffected)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/license/fields/[field]/route.ts
git commit -m "feat: add /api/license/fields/[field] proxy route"
```

---

## Task 3: Gate the stats page

**Files:**
- Modify: `src/app/stats/page.tsx`

- [ ] **Step 1: Update the stats page**

Replace the entire contents of `src/app/stats/page.tsx` with:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AsciiStats } from '@/components/AsciiStats'

interface RosterData {
  team: { name: string; abbr: string; franchiseName: string }
  batters: Array<{
    id: string; number: number; name: string; position: string
    season: { games: number; atBats: number; hits: number; homeRuns: number; rbi: number; walks: number; strikeouts: number } | null
  }>
  pitchers: Array<{
    id: string; number: number; name: string; position: string
    season: { gamesStarted: number; inningsPitched: number; hitsAllowed: number; walksAllowed: number; strikeoutsThrown: number; earnedRuns: number } | null
  }>
}

export default function StatsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [roster, setRoster] = useState<RosterData | null>(null)
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      Promise.all([
        fetch('/api/roster').then((r) => r.json()),
        fetch('/api/license/fields/advanced_stats_enabled').then((r) => r.json()),
      ]).then(([rosterData, { enabled }]) => {
        setRoster(rosterData)
        setAdvancedStatsEnabled(enabled)
      })
    }
  }, [status])

  if (!roster || advancedStatsEnabled === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <pre className="font-mono text-green-400">LOADING ROSTER...</pre>
      </div>
    )
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
      {advancedStatsEnabled ? (
        <AsciiStats
          teamName={roster.team.name}
          franchiseName={roster.team.franchiseName}
          batters={roster.batters}
          pitchers={roster.pitchers}
        />
      ) : (
        <div className="min-h-screen bg-black flex items-center justify-center">
          <pre className="font-mono text-green-400 text-center">{[
            '╔══════════════════════════════════════╗',
            '║      ADVANCED STATS: LOCKED          ║',
            '║                                      ║',
            '║  This feature requires an upgraded   ║',
            '║  license. Contact your vendor to     ║',
            '║  enable advanced stats.              ║',
            '╚══════════════════════════════════════╝',
          ].join('\n')}</pre>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/stats/page.tsx
git commit -m "feat: gate stats page behind advanced_stats_enabled license entitlement"
```
