import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

beforeEach(async () => {
  vi.stubEnv('REPLICATED_SDK_URL', 'http://replicated:3000')
  const { getServerSession } = await import('next-auth')
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/support-bundle', () => {
  it('returns 401 when not authenticated', async () => {
    const { getServerSession } = await import('next-auth')
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })
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
      'http://replicated:3000/api/v1/supportbundle',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
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
