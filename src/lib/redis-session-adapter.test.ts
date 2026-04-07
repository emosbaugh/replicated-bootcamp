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
