# Update Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poll the Replicated SDK `/app/updates` endpoint every 60 seconds and show a global fixed banner when an update is available.

**Architecture:** A Next.js API route proxies the SDK call server-side (the SDK URL is a cluster-internal service, unreachable from the browser). A client component mounts in `layout.tsx`, polls that route on an interval, and renders a yellow banner when updates are found. Banner persists across page navigations and stays visible until updates are no longer returned.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/updates/route.ts` | Proxy `GET /api/v1/app/updates` from SDK; return `[]` on error or missing env var |
| Create | `src/components/UpdateBanner.tsx` | Client component; polls `/api/updates` every 60s; renders banner when update available |
| Modify | `src/app/layout.tsx` | Mount `<UpdateBanner />` as first child of `<body>` |

---

### Task 1: Add the `/api/updates` proxy route

**Files:**
- Create: `src/app/api/updates/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from 'next/server'

export async function GET() {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return NextResponse.json([])

  try {
    const res = await fetch(`${sdkUrl}/api/v1/app/updates`)
    if (!res.ok) {
      console.error('[updates] SDK returned', res.status)
      return NextResponse.json([])
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[updates] failed to fetch updates', err)
    return NextResponse.json([])
  }
}
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

```bash
npm test
```

Expected: all tests pass (no new tests for this route — it's a thin proxy with catch-all error handling, same pattern as `src/lib/metrics.ts`)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/updates/route.ts
git commit -m "feat: add /api/updates proxy route for Replicated SDK"
```

---

### Task 2: Add the `UpdateBanner` client component

**Files:**
- Create: `src/components/UpdateBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect } from 'react'

type Update = {
  versionLabel: string
  releaseNotes: string
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null)

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const res = await fetch('/api/updates')
        const data: Update[] = await res.json()
        if (data.length > 0) {
          setUpdate(data[0])
        }
      } catch {
        // preserve current banner state on transient failures
      }
    }

    checkForUpdates()
    const interval = setInterval(checkForUpdates, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!update) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-yellow-400 font-mono text-xs text-yellow-400 text-center py-2 px-4">
      UPDATE AVAILABLE: v{update.versionLabel} — {update.releaseNotes}
    </div>
  )
}
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/UpdateBanner.tsx
git commit -m "feat: add UpdateBanner component with 60s polling"
```

---

### Task 3: Mount `UpdateBanner` in the root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the import and mount the component**

Replace the contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { UpdateBanner } from '@/components/UpdateBanner'

export const metadata: Metadata = {
  title: 'playball.exe',
  description: 'Turn-by-turn baseball dice game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-green-400">
        <UpdateBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: mount UpdateBanner in root layout"
```
