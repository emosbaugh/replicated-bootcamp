# Custom Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send `users_total`, `games_completed`, `games_won`, and `games_lost` to the Replicated Vendor Portal via the SDK's custom metrics API, triggered on user signup, user login, and game completion.

**Architecture:** A single `sendCustomMetrics()` helper queries Postgres for current aggregate totals and POSTs them to the Replicated SDK sidecar. It is fire-and-forget (no await at call sites) and never throws. `REPLICATED_SDK_URL` is injected via Helm secret so the function no-ops in local dev when the env var is absent.

**Tech Stack:** Next.js 16, Prisma 7, Helm 3, Replicated SDK subchart (`playball-exe-sdk`)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/lib/metrics.ts` | `sendCustomMetrics()` — queries DB, POSTs to SDK |
| Modify | `src/app/api/auth/register/route.ts` | Fire metrics after user created |
| Modify | `src/lib/auth.ts` | Fire metrics after login verified |
| Modify | `src/lib/game-end.ts` | Fire metrics after season stats updated |
| Modify | `deploy/charts/templates/_helpers.tpl` | Add `playball-exe.sdkUrl` helper |
| Modify | `deploy/charts/templates/secret.yaml` | Inject `REPLICATED_SDK_URL` env var |

---

### Task 1: Create `src/lib/metrics.ts`

**Files:**
- Create: `src/lib/metrics.ts`

- [ ] **Step 1: Create the file**

Create `src/lib/metrics.ts` with this exact content:

```typescript
import { prisma } from '@/lib/db'

export async function sendCustomMetrics(): Promise<void> {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return

  try {
    const [usersTotal, gameResults] = await Promise.all([
      prisma.user.count(),
      prisma.game.groupBy({
        by: ['result'],
        where: { status: 'completed' },
        _count: { id: true },
      }),
    ])

    const gamesCompleted = gameResults.reduce((sum, r) => sum + r._count.id, 0)
    const gamesWon = gameResults.find((r) => r.result === 'user_win')?._count.id ?? 0
    const gamesLost = gameResults.find((r) => r.result === 'cpu_win')?._count.id ?? 0

    await fetch(`${sdkUrl}/api/v1/app/custom-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          users_total: usersTotal,
          games_completed: gamesCompleted,
          games_won: gamesWon,
          games_lost: gamesLost,
        },
      }),
    })
  } catch (err) {
    console.error('[metrics] failed to send custom metrics', err)
  }
}
```

- [ ] **Step 2: Run existing tests to confirm nothing is broken**

```bash
npm test
```

Expected: all existing tests pass (metrics.ts has no tests — it's a fire-and-forget side effect with no logic to unit test).

- [ ] **Step 3: Commit**

```bash
git add src/lib/metrics.ts
git commit -m "feat: add sendCustomMetrics helper"
```

---

### Task 2: Wire metrics into signup

**Files:**
- Modify: `src/app/api/auth/register/route.ts`

- [ ] **Step 1: Add the import and fire metrics after user creation**

In `src/app/api/auth/register/route.ts`, add the import at the top (after the existing imports):

```typescript
import { sendCustomMetrics } from '@/lib/metrics'
```

Then after the `await prisma.$transaction(...)` call (line 23–32) and before the `return NextResponse.json(...)` line, add:

```typescript
    sendCustomMetrics()
```

The function should look like this after the edit:

```typescript
export async function POST(req: NextRequest) {
  try {
    const { email, password, franchiseName } = await req.json()

    if (!email || !password || !franchiseName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    let mlbTeamName: string, mlbTeamAbbr: string
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          franchiseName,
        },
      })
      ;({ mlbTeamName, mlbTeamAbbr } = await draftTeam(user.id, tx))
    })

    sendCustomMetrics()

    return NextResponse.json({ success: true, mlbTeamName: mlbTeamName!, mlbTeamAbbr: mlbTeamAbbr! })
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/register/route.ts
git commit -m "feat: send custom metrics on user signup"
```

---

### Task 3: Wire metrics into login

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add the import and fire metrics after credentials verified**

In `src/lib/auth.ts`, add the import at the top (after the existing imports):

```typescript
import { sendCustomMetrics } from '@/lib/metrics'
```

Then inside the `authorize` function, after `if (!valid) return null` and before the `return { id: ... }` line, add `sendCustomMetrics()`:

```typescript
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null
        sendCustomMetrics()
        return { id: user.id, email: user.email, name: user.franchiseName }
      },
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: send custom metrics on user login"
```

---

### Task 4: Wire metrics into game completion

**Files:**
- Modify: `src/lib/game-end.ts`

- [ ] **Step 1: Add the import and fire metrics at the end of `finalizeGame`**

In `src/lib/game-end.ts`, add the import at the top (after the existing imports):

```typescript
import { sendCustomMetrics } from '@/lib/metrics'
```

Then add `sendCustomMetrics()` as the last line inside `finalizeGame`, after the pitcher stats update block. The complete file should look like:

```typescript
import { prisma } from '@/lib/db'
import { sendCustomMetrics } from '@/lib/metrics'

// Called when a game completes.
// Reads game.gameStats and increments PlayerSeason for each user player.
export async function finalizeGame(gameId: string, userId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return

  const gameStats = game.gameStats as Record<
    string,
    { ab: number; h: number; hr: number; rbi: number; bb: number; k: number; doubles: number; triples: number }
  >

  for (const [playerId, stats] of Object.entries(gameStats)) {
    const season = await prisma.playerSeason.findUnique({ where: { playerId } })
    if (!season) continue

    await prisma.playerSeason.update({
      where: { playerId },
      data: {
        games: { increment: 1 },
        atBats: { increment: stats.ab },
        hits: { increment: stats.h },
        doubles: { increment: stats.doubles ?? 0 },
        triples: { increment: stats.triples ?? 0 },
        homeRuns: { increment: stats.hr },
        rbi: { increment: stats.rbi },
        walks: { increment: stats.bb ?? 0 },
        strikeouts: { increment: stats.k ?? 0 },
      },
    })
  }

  // Update pitcher stats
  const userPitcher = await prisma.player.findUnique({
    where: { id: game.userPitcherId },
    include: { playerSeason: true },
  })
  if (userPitcher?.playerSeason) {
    await prisma.playerSeason.update({
      where: { playerId: userPitcher.id },
      data: {
        gamesStarted: { increment: 1 },
        inningsPitched: { increment: game.inning },
        earnedRuns: { increment: game.awayScore },
      },
    })
  }

  sendCustomMetrics()
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game-end.ts
git commit -m "feat: send custom metrics on game completion"
```

---

### Task 5: Add Helm SDK URL helper and inject env var

**Files:**
- Modify: `deploy/charts/templates/_helpers.tpl`
- Modify: `deploy/charts/templates/secret.yaml`

- [ ] **Step 1: Add `playball-exe.sdkUrl` helper to `_helpers.tpl`**

Append the following block to the end of `deploy/charts/templates/_helpers.tpl`:

```
{{/*
Replicated SDK service URL for custom metrics.
Builds from release name + nameOverride to match the SDK subchart's service name.
*/}}
{{- define "playball-exe.sdkUrl" -}}
{{- printf "http://%s-%s:3000" .Release.Name .Values.sdk.nameOverride }}
{{- end }}
```

- [ ] **Step 2: Add `REPLICATED_SDK_URL` to `secret.yaml`**

In `deploy/charts/templates/secret.yaml`, add the following after the `REDIS_URL` line, inside the `stringData` block:

```yaml
  {{- if .Values.sdk.enabled }}
  REPLICATED_SDK_URL: {{ include "playball-exe.sdkUrl" . | quote }}
  {{- end }}
```

The complete file should look like:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "playball-exe.fullname" . }}
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
type: Opaque
stringData:
  DATABASE_URL: {{ include "playball-exe.databaseUrl" . | quote }}
  NEXTAUTH_SECRET: {{ required "nextauth.secret is required — generate with: openssl rand -base64 32" .Values.nextauth.secret | quote }}
  NEXTAUTH_URL: {{ .Values.nextauth.url | quote }}
  REDIS_URL: {{ include "playball-exe.redisUrl" . | quote }}
  {{- if .Values.sdk.enabled }}
  REPLICATED_SDK_URL: {{ include "playball-exe.sdkUrl" . | quote }}
  {{- end }}
```

- [ ] **Step 3: Lint the Helm chart**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 4: Commit**

```bash
git add deploy/charts/templates/_helpers.tpl deploy/charts/templates/secret.yaml
git commit -m "feat: inject REPLICATED_SDK_URL into app secret via Helm"
```

---

### Task 6: Verify end-to-end in Vendor Portal

This task is manual — no code changes.

- [ ] **Step 1: Deploy to a cluster with the Replicated SDK enabled**

Ensure the app is deployed with `sdk.enabled=true` (the default). The SDK sidecar will be running as `{release-name}-playball-exe-sdk`.

- [ ] **Step 2: Generate real activity**

In the running app:
1. Register a new user account (triggers signup metric)
2. Log in with that account (triggers login metric)
3. Play a game to completion (triggers game completion metric)

- [ ] **Step 3: Check Vendor Portal**

Navigate to **Vendor Portal → Customers → [your instance] → Instance Details**.

Under **Custom Metrics**, confirm you see:
- `users_total` ≥ 1
- `games_completed` ≥ 1
- `games_won` or `games_lost` ≥ 1 (depending on outcome)

- [ ] **Step 4: Docker build check**

```bash
docker build -f deploy/Dockerfile .
```

Expected: build completes successfully.
