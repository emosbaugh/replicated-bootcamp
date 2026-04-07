# Redis Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Redis to playball-exe for game state caching and next-auth session storage, and wire it into the Docker Compose and Helm chart as a second upstream subchart dependency.

**Architecture:** A singleton `ioredis` client is shared across two concerns: (1) `buildGameState` reads from a Redis cache before hitting Postgres, and invalidates on every at-bat write; (2) a custom next-auth adapter stores sessions as JSON in Redis while delegating user lookups to the existing Prisma/Postgres schema. The Bitnami Redis Helm chart is added as a second `oci://` subchart dependency alongside the existing Bitnami PostgreSQL chart.

**Tech Stack:** `ioredis`, next-auth v4 database adapter interface, Bitnami Redis Helm chart (`oci://registry-1.docker.io/bitnamicharts/redis`), Docker Compose `redis:7-alpine`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/redis.ts` | Create | Singleton ioredis client from `REDIS_URL` |
| `src/lib/redis-session-adapter.ts` | Create | next-auth Adapter: users from Prisma, sessions from Redis |
| `src/lib/redis-session-adapter.test.ts` | Create | Unit tests for adapter methods |
| `src/lib/game-state.ts` | Modify | Cache read/write around Postgres queries |
| `src/app/api/game/at-bat/route.ts` | Modify | Invalidate cache at top of handler |
| `src/lib/auth.ts` | Modify | Switch to `database` strategy + custom adapter |
| `package.json` | Modify | Add `ioredis` dependency |
| `docker-compose.yml` | Modify | Add `redis:7-alpine` service |
| `deploy/charts/Chart.yaml` | Modify | Add Bitnami Redis subchart dependency |
| `deploy/charts/values.yaml` | Modify | Add `redis:` block |
| `deploy/charts/templates/_helpers.tpl` | Modify | Add `playball-exe.redisUrl` helper |
| `deploy/charts/templates/secret.yaml` | Modify | Add `REDIS_URL` env var |

---

## Task 1: Add ioredis and create Redis singleton

**Files:**
- Modify: `package.json`
- Create: `src/lib/redis.ts`

- [ ] **Step 1: Install ioredis**

```bash
npm install ioredis
```

Expected: `ioredis` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Create the Redis singleton**

Create `src/lib/redis.ts`:

```ts
import Redis from 'ioredis'

const url = process.env.REDIS_URL
if (!url) throw new Error('REDIS_URL is not set')

export const redis = new Redis(url)
```

- [ ] **Step 3: Add REDIS_URL to local env**

Add to `.env.local` (create it if it doesn't exist):

```
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 4: Verify the app still builds**

```bash
npm run build
```

Expected: build completes without errors (Redis won't connect at build time — that's fine).

- [ ] **Step 5: Commit**

```bash
git add src/lib/redis.ts package.json package-lock.json .env.local
git commit -m "feat: add ioredis dependency and Redis singleton"
```

---

## Task 2: Docker Compose — add Redis service

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the redis service**

Edit `docker-compose.yml` to add the `redis` service:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: baseball
      POSTGRES_PASSWORD: baseball
      POSTGRES_DB: baseball
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
volumes:
  postgres_data:
```

- [ ] **Step 2: Verify Redis starts**

```bash
docker compose up redis -d
docker compose ps
```

Expected: `redis` service shows as `running`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Redis service to docker-compose"
```

---

## Task 3: Helm Chart — add Bitnami Redis subchart

**Files:**
- Modify: `deploy/charts/Chart.yaml`
- Modify: `deploy/charts/values.yaml`
- Modify: `deploy/charts/templates/_helpers.tpl`
- Modify: `deploy/charts/templates/secret.yaml`

- [ ] **Step 1: Look up the latest Bitnami Redis chart version**

```bash
helm show chart oci://registry-1.docker.io/bitnamicharts/redis 2>/dev/null | grep '^version:'
```

Note the version (e.g. `21.1.3`). Use that exact version in the next step.

- [ ] **Step 2: Add Redis dependency to Chart.yaml**

Edit `deploy/charts/Chart.yaml`. Add the redis entry to `dependencies` (replace `<VERSION>` with the version from the previous step):

```yaml
apiVersion: v2
name: playball-exe
description: Helm chart for deploying the playball.exe baseball game
type: application
version: 0.1.0
appVersion: "latest"
dependencies:
  - name: postgresql
    version: "18.5.15"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
  - name: redis
    version: "<VERSION>"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: redis.enabled
```

- [ ] **Step 3: Add redis block to values.yaml**

Edit `deploy/charts/values.yaml`. Add below the existing `externalDatabase` block:

```yaml
# Set redis.enabled=false and provide externalRedis.url to use your own Redis
redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: false

# Only used when redis.enabled=false
externalRedis:
  url: ""
```

- [ ] **Step 4: Add Redis URL helper to _helpers.tpl**

Edit `deploy/charts/templates/_helpers.tpl`. Append after the existing `playball-exe.databaseUrl` template:

```
{{/*
The ClusterIP service name that the Bitnami redis subchart creates.
Bitnami names it: <release-name>-redis-master
*/}}
{{- define "playball-exe.redis.serviceName" -}}
{{- printf "%s-redis-master" .Release.Name }}
{{- end }}

{{/*
REDIS_URL — constructed from subchart values when redis.enabled,
or passed through from externalRedis.url.
*/}}
{{- define "playball-exe.redisUrl" -}}
{{- if .Values.redis.enabled -}}
{{- printf "redis://%s:6379" (include "playball-exe.redis.serviceName" .) }}
{{- else -}}
{{- required "externalRedis.url is required when redis.enabled=false" .Values.externalRedis.url }}
{{- end }}
{{- end }}
```

- [ ] **Step 5: Add REDIS_URL to the Secret template**

Edit `deploy/charts/templates/secret.yaml`. Add `REDIS_URL` to `stringData`:

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
```

- [ ] **Step 6: Pull the chart dependency**

```bash
cd deploy/charts && helm dependency update
```

Expected: `charts/redis-<VERSION>.tgz` appears in `deploy/charts/charts/`.

- [ ] **Step 7: Verify Helm rendering**

```bash
helm template test-release deploy/charts --set nextauth.secret=testsecret | grep -A2 'REDIS_URL'
```

Expected output contains:
```
REDIS_URL: redis://test-release-redis-master:6379
```

- [ ] **Step 8: Commit**

```bash
git add deploy/charts/Chart.yaml deploy/charts/values.yaml deploy/charts/templates/_helpers.tpl deploy/charts/templates/secret.yaml deploy/charts/charts/ deploy/charts/Chart.lock
git commit -m "feat: add Bitnami Redis subchart and REDIS_URL to Helm chart"
```

---

## Task 4: Game state cache

**Files:**
- Modify: `src/lib/game-state.ts`
- Modify: `src/app/api/game/at-bat/route.ts`

- [ ] **Step 1: Add cache to buildGameState**

Replace the contents of `src/lib/game-state.ts` with:

```ts
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import type { GameState } from '@/app/api/game/types'

const CACHE_TTL = 30 // seconds

export async function buildGameState(gameId: string, userId: string): Promise<GameState | null> {
  const cacheKey = `game-state:${gameId}`

  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached) as GameState
  }

  const game = await prisma.game.findFirst({
    where: { id: gameId, userId },
  })
  if (!game) return null

  // Get user's team info
  const team = await prisma.team.findUnique({
    where: { userId },
    include: { mlbTeam: true },
  })
  if (!team) return null

  // Get batting lineup (players with lineupOrder 1-9, sorted)
  const lineup = await prisma.player.findMany({
    where: { teamId: team.id },
    include: {
      mlbPlayer: true,
      playerSeason: true,
    },
    orderBy: { mlbPlayer: { lineupOrder: 'asc' } },
  })
  const batters = lineup.filter((p) => p.mlbPlayer.lineupOrder !== null)

  const currentPlayer = batters[game.lineupPosition % batters.length]
  if (!currentPlayer) return null

  const mlp = currentPlayer.mlbPlayer
  const season = currentPlayer.playerSeason

  const gameStats = game.gameStats as Record<string, { ab: number; h: number; hr: number; rbi: number }>
  const myGameStats = gameStats[currentPlayer.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0 }

  const avg = season && season.atBats > 0
    ? (season.hits / season.atBats).toFixed(3).replace('0.', '.')
    : '.000'

  const gameLog = game.gameLog as string[]

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { franchiseName: true } })
  if (!user) return null

  const state: GameState = {
    id: game.id,
    inning: game.inning,
    halfInning: game.halfInning as 'top' | 'bot',
    outs: game.outs,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    runnersOnBase: game.runnersOnBase as GameState['runnersOnBase'],
    currentBatter: {
      id: currentPlayer.id,
      name: mlp.name,
      position: mlp.position,
      number: mlp.number,
      contact: mlp.contact,
      power: mlp.power,
      speed: mlp.speed,
      gameStats: myGameStats,
      seasonStats: {
        avg,
        hr: season?.homeRuns ?? 0,
        rbi: season?.rbi ?? 0,
      },
    },
    gameLog: gameLog.slice(-5).reverse(),
    status: game.status as 'in_progress' | 'completed',
    result: game.result as GameState['result'],
    userTeam: {
      name: team.mlbTeam.name,
      abbr: team.mlbTeam.abbr,
      franchiseName: user.franchiseName,
    },
    cpuTeam: {
      name: game.cpuTeamName,
      abbr: game.cpuTeamAbbr,
    },
    lastCpuLog: undefined,
  }

  await redis.set(cacheKey, JSON.stringify(state), 'EX', CACHE_TTL)
  return state
}

export async function invalidateGameStateCache(gameId: string): Promise<void> {
  await redis.del(`game-state:${gameId}`)
}
```

- [ ] **Step 2: Invalidate cache in at-bat route**

Edit `src/app/api/game/at-bat/route.ts`. Add the import at the top (after the existing imports):

```ts
import { invalidateGameStateCache } from '@/lib/game-state'
```

Then add the cache invalidation call immediately after the active game is confirmed (after the `if (!game)` guard, before any game logic):

```ts
    if (!game) {
      return NextResponse.json({ error: 'No active game' }, { status: 404 })
    }

    await invalidateGameStateCache(game.id)

    // Load user's batting lineup
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass (game-engine, baserunning, cpu-runner).

- [ ] **Step 4: Smoke test manually**

With `docker compose up` running, start the dev server (`npm run dev`), sign in, start a game, and click through a few at-bats. Verify the game advances correctly. Check Redis:

```bash
docker compose exec redis redis-cli keys 'game-state:*'
```

Expected: one key per active game.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-state.ts src/app/api/game/at-bat/route.ts
git commit -m "feat: cache game state in Redis, invalidate on at-bat"
```

---

## Task 5: Redis session adapter (TDD)

**Files:**
- Create: `src/lib/redis-session-adapter.ts`
- Create: `src/lib/redis-session-adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/redis-session-adapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRedisSessionAdapter } from './redis-session-adapter'

// Minimal Redis mock — adapter only uses get/set/del
const mockRedis = {
  get: vi.fn<[string], Promise<string | null>>(),
  set: vi.fn<[string, string, string, number], Promise<'OK'>>(),
  del: vi.fn<[string], Promise<number>>(),
}

// Minimal Prisma mock — adapter only uses prisma.user.findUnique
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
}

const adapter = createRedisSessionAdapter(
  mockRedis as any,
  mockPrisma as any,
)

const fakeUser = {
  id: 'user-1',
  email: 'test@example.com',
  franchiseName: 'Test Franchise',
  passwordHash: 'hash',
  createdAt: new Date(),
}

const fakeAdapterUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test Franchise',
  emailVerified: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getUserByEmail', () => {
  it('returns mapped AdapterUser when found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser)
    const result = await adapter.getUserByEmail!('test@example.com')
    expect(result).toEqual(fakeAdapterUser)
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
  })

  it('returns null when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const result = await adapter.getUserByEmail!('nobody@example.com')
    expect(result).toBeNull()
  })
})

describe('getUser', () => {
  it('returns mapped AdapterUser by id', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser)
    const result = await adapter.getUser('user-1')
    expect(result).toEqual(fakeAdapterUser)
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } })
  })

  it('returns null when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const result = await adapter.getUser('missing')
    expect(result).toBeNull()
  })
})

describe('createSession', () => {
  it('stores session in Redis and returns it', async () => {
    mockRedis.set.mockResolvedValue('OK')
    const session = {
      sessionToken: 'tok-1',
      userId: 'user-1',
      expires: new Date('2026-05-01'),
    }
    const result = await adapter.createSession(session)
    expect(result).toEqual(session)
    expect(mockRedis.set).toHaveBeenCalledWith(
      'next-auth:session:tok-1',
      JSON.stringify(session),
      'EX',
      expect.any(Number),
    )
  })
})

describe('getSessionAndUser', () => {
  it('returns session and user when both exist', async () => {
    const session = {
      sessionToken: 'tok-1',
      userId: 'user-1',
      expires: new Date('2026-05-01').toISOString(),
    }
    mockRedis.get.mockResolvedValue(JSON.stringify(session))
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser)

    const result = await adapter.getSessionAndUser('tok-1')
    expect(result).not.toBeNull()
    expect(result!.session.sessionToken).toBe('tok-1')
    expect(result!.session.expires).toBeInstanceOf(Date)
    expect(result!.user).toEqual(fakeAdapterUser)
  })

  it('returns null when session not in Redis', async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await adapter.getSessionAndUser('missing')
    expect(result).toBeNull()
  })

  it('returns null when user no longer exists', async () => {
    const session = {
      sessionToken: 'tok-1',
      userId: 'gone-user',
      expires: new Date('2026-05-01').toISOString(),
    }
    mockRedis.get.mockResolvedValue(JSON.stringify(session))
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await adapter.getSessionAndUser('tok-1')
    expect(result).toBeNull()
  })
})

describe('deleteSession', () => {
  it('deletes from Redis and returns the session', async () => {
    const session = {
      sessionToken: 'tok-1',
      userId: 'user-1',
      expires: new Date('2026-05-01').toISOString(),
    }
    mockRedis.get.mockResolvedValue(JSON.stringify(session))
    mockRedis.del.mockResolvedValue(1)

    const result = await adapter.deleteSession('tok-1')
    expect(result).not.toBeNull()
    expect(result!.sessionToken).toBe('tok-1')
    expect(mockRedis.del).toHaveBeenCalledWith('next-auth:session:tok-1')
  })

  it('returns null when session not found', async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await adapter.deleteSession('missing')
    expect(result).toBeNull()
  })
})

describe('updateSession', () => {
  it('merges update and re-saves to Redis', async () => {
    const existing = {
      sessionToken: 'tok-1',
      userId: 'user-1',
      expires: new Date('2026-05-01').toISOString(),
    }
    mockRedis.get.mockResolvedValue(JSON.stringify(existing))
    mockRedis.set.mockResolvedValue('OK')

    const newExpiry = new Date('2026-06-01')
    const result = await adapter.updateSession!({ sessionToken: 'tok-1', expires: newExpiry })
    expect(result).not.toBeNull()
    expect(result!.expires).toEqual(newExpiry)
    expect(mockRedis.set).toHaveBeenCalled()
  })

  it('returns null when session not found', async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await adapter.updateSession!({ sessionToken: 'missing' })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/lib/redis-session-adapter.test.ts
```

Expected: FAIL — "Cannot find module './redis-session-adapter'"

- [ ] **Step 3: Implement the adapter**

Create `src/lib/redis-session-adapter.ts`:

```ts
import type { Adapter, AdapterUser, AdapterSession } from 'next-auth/adapters'
import type { Redis } from 'ioredis'
import type { PrismaClient } from '@prisma/client'

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

type MinimalRedis = Pick<Redis, 'get' | 'set' | 'del'>
type MinimalPrisma = Pick<PrismaClient, 'user'>

function mapUser(u: { id: string; email: string; franchiseName: string }): AdapterUser {
  return {
    id: u.id,
    email: u.email,
    name: u.franchiseName,
    emailVerified: null,
  }
}

export function createRedisSessionAdapter(redis: MinimalRedis, prisma: MinimalPrisma): Adapter {
  return {
    // --- User methods (Prisma-backed) ---

    async createUser(user) {
      // Users are created via /api/auth/register, not through next-auth.
      // This path is reached when next-auth cannot find the user by email after
      // authorize() succeeds — which shouldn't happen in normal operation.
      const existing = await prisma.user.findUnique({ where: { email: user.email } })
      if (existing) return mapUser(existing)
      throw new Error('User not found — register via /api/auth/register')
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } })
      return user ? mapUser(user) : null
    },

    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email } })
      return user ? mapUser(user) : null
    },

    async getUserByAccount() {
      return null // No OAuth providers
    },

    async updateUser(user) {
      const existing = await prisma.user.findUnique({ where: { id: user.id } })
      if (!existing) throw new Error(`User ${user.id} not found`)
      return mapUser(existing)
    },

    async linkAccount() {
      return null // No OAuth providers
    },

    // --- Session methods (Redis-backed) ---

    async createSession(session) {
      const key = `next-auth:session:${session.sessionToken}`
      await redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
      return session
    },

    async getSessionAndUser(sessionToken) {
      const key = `next-auth:session:${sessionToken}`
      const raw = await redis.get(key)
      if (!raw) return null

      const stored = JSON.parse(raw) as Omit<AdapterSession, 'expires'> & { expires: string }
      const session: AdapterSession = {
        ...stored,
        expires: new Date(stored.expires),
      }

      const user = await prisma.user.findUnique({ where: { id: session.userId } })
      if (!user) return null

      return { session, user: mapUser(user) }
    },

    async updateSession(session) {
      const key = `next-auth:session:${session.sessionToken}`
      const raw = await redis.get(key)
      if (!raw) return null

      const existing = JSON.parse(raw) as AdapterSession
      const updated: AdapterSession = { ...existing, ...session }
      await redis.set(key, JSON.stringify(updated), 'EX', SESSION_TTL_SECONDS)
      return updated
    },

    async deleteSession(sessionToken) {
      const key = `next-auth:session:${sessionToken}`
      const raw = await redis.get(key)
      if (!raw) return null
      await redis.del(key)
      const stored = JSON.parse(raw) as Omit<AdapterSession, 'expires'> & { expires: string }
      return { ...stored, expires: new Date(stored.expires) }
    },
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test src/lib/redis-session-adapter.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/redis-session-adapter.ts src/lib/redis-session-adapter.test.ts
git commit -m "feat: implement Redis-backed next-auth session adapter"
```

---

## Task 6: Wire session adapter into auth.ts

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Update auth.ts**

Replace the contents of `src/lib/auth.ts` with:

```ts
import { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { createRedisSessionAdapter } from '@/lib/redis-session-adapter'
import bcrypt from 'bcryptjs'

export const authOptions: AuthOptions = {
  adapter: createRedisSessionAdapter(redis, prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.franchiseName }
      },
    }),
  ],
  session: { strategy: 'database' },
  pages: { signIn: '/' },
  callbacks: {
    session({ session, user }) {
      if (user && session.user) session.user.id = user.id
      return session
    },
  },
}
```

Note: the `session` callback now receives `user` (from the adapter) instead of `token`. The `jwt` callback is removed entirely.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass (auth.ts isn't unit-tested, but existing tests should still pass).

- [ ] **Step 3: Smoke test sign-in end-to-end**

With `docker compose up` running and `npm run dev`:

1. Sign in with an existing account
2. Navigate to a page that requires auth (e.g. `/roster`)
3. Refresh the page — session should persist
4. Check Redis for session keys:
   ```bash
   docker compose exec redis redis-cli keys 'next-auth:session:*'
   ```
   Expected: one key per active session.
5. Sign out — key should be deleted:
   ```bash
   docker compose exec redis redis-cli keys 'next-auth:session:*'
   ```
   Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: switch next-auth to Redis-backed database sessions"
```
