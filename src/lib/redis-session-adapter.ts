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
