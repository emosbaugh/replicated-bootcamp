# Redis Integration Design

**Date:** 2026-04-06  
**App:** playball-exe (Next.js 16, PostgreSQL/Prisma, next-auth v4)  
**Motivation:** Add Redis as a second upstream Helm chart dependency (bootcamp requirement), used for game state caching and next-auth session storage.

---

## 1. Infrastructure

### Docker Compose

Add a `redis` service to `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
```

No password, no persistence volume — ephemeral is fine for local dev.

### Helm Chart

Add Bitnami Redis as a second dependency in `deploy/charts/Chart.yaml`:

```yaml
- name: redis
  version: "21.x.x"   # pin to latest stable at implementation time
  repository: oci://registry-1.docker.io/bitnamicharts
  condition: redis.enabled
```

Add a `redis` block to `deploy/charts/values.yaml`:

```yaml
redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: false
```

Add `REDIS_URL` to `deploy/charts/templates/secret.yaml`, constructed from the subchart's service name using a helper (same pattern as `DATABASE_URL` for PostgreSQL).

### App Redis Client

Add `src/lib/redis.ts` — a singleton `ioredis` client:

```ts
import Redis from 'ioredis'
export const redis = new Redis(process.env.REDIS_URL!)
```

`REDIS_URL` is injected via the Kubernetes Secret (Helm) or set in `.env.local` for local dev.

---

## 2. Game State Cache

### Problem

`buildGameState` (`src/lib/game-state.ts`) fires 4–5 Postgres queries per call. It is invoked:
- At the end of every `POST /api/game/at-bat`
- On every `GET /api/game/current`

### Cache Design

- **Key:** `game-state:{gameId}`
- **TTL:** 30 seconds (safety net — prevents stale data surviving a crash)
- **Serialization:** JSON

**Read path (buildGameState):**
1. Check Redis for `game-state:{gameId}`
2. On hit: parse and return cached value
3. On miss: run existing Postgres queries, write result to Redis with 30s TTL, return result

**Write path (at-bat/route.ts):**
At the top of the handler, after loading the active game, delete `game-state:{gameId}` from Redis once. `at-bat/route.ts` has multiple `prisma.game.update` call sites; invalidating once at the start is simpler and sufficient. The subsequent call to `buildGameState` at the end of every code path repopulates the cache with fresh data.

This ensures:
- High cache hit rate for `GET /api/game/current` calls during a game
- Consistency: cache is always invalidated before a write and repopulated after

### Files Changed

- `src/lib/game-state.ts` — add cache read/write around existing logic
- `src/lib/redis.ts` — new singleton (see above)
- `src/app/api/game/at-bat/route.ts` — add cache invalidation before each `prisma.game.update`

---

## 3. Session Store

### Problem

next-auth currently uses `strategy: 'jwt'` (stateless). Switching to a server-side Redis session store is required to demonstrate Redis as a second upstream chart dependency.

### Session Design

Implement a lightweight custom Redis adapter in `src/lib/redis-session-adapter.ts`. next-auth v4's adapter interface requires only 4 methods for session-based auth with `CredentialsProvider`: `createUser`, `getUser`, `getUserByEmail`, `createSession`, `getSessionAndUser`, `updateSession`, `deleteSession`. Sessions are stored as JSON strings in Redis with a key of `session:{token}` and TTL of 30 days. Users are stored as `user:{id}` and `user:email:{email}`.

**Changes to `src/lib/auth.ts`:**
- Import the custom adapter
- Pass `adapter: redisSessionAdapter(redis)` to `authOptions`
- Change `session.strategy` from `'jwt'` to `'database'`
- Remove the `jwt` callback
- Keep the `session` callback to attach `user.id`

### Files Changed

- `src/lib/auth.ts` — switch strategy, add adapter, remove jwt callback
- `src/lib/redis-session-adapter.ts` — new custom adapter (new file)
- `package.json` — add `ioredis` dependency

---

## 4. Environment Variables

| Variable | Local (`.env.local`) | Kubernetes (Secret) |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Constructed from Bitnami Redis service name |

---

## 5. Dependencies to Add

```
ioredis
```

`@types/ioredis` is not needed — `ioredis` ships its own TypeScript types.
