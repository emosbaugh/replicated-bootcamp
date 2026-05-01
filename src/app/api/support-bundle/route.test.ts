import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('child_process', () => ({ execFile: vi.fn() }))
vi.mock('fs/promises', () => ({ readFile: vi.fn(), unlink: vi.fn() }))

beforeEach(async () => {
  vi.stubEnv('REPLICATED_SDK_URL', 'http://replicated:3000')

  const { getServerSession } = await import('next-auth')
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any)

  const { execFile } = await import('child_process')
  vi.mocked(execFile).mockImplementation((...args: any[]) => {
    args[args.length - 1](null, '', '')
  })

  const { readFile, unlink } = await import('fs/promises')
  vi.mocked(readFile as any).mockResolvedValue(Buffer.from('fake-bundle-data'))
  vi.mocked(unlink).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/support-bundle', () => {
  it('returns 401 when not authenticated', async () => {
    const { getServerSession } = await import('next-auth')
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 503 when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const res = await POST()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'SDK not configured' })
  })

  it('returns 200 and uploads bundle as gzip when SDK returns ok', async () => {
    const fakeBundleData = Buffer.from('fake-bundle-data')
    const { readFile } = await import('fs/promises')
    vi.mocked(readFile as any).mockResolvedValue(fakeBundleData)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://replicated:3000/api/v1/supportbundle',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/gzip',
          'Content-Length': String(fakeBundleData.length),
        }),
        body: fakeBundleData,
      })
    )
  })

  it('returns the SDK status when SDK returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const res = await POST()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Failed to upload support bundle' })
  })

  it('returns 500 when support-bundle binary fails', async () => {
    const { execFile } = await import('child_process')
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args[args.length - 1](new Error('binary failed'), '', '')
    })
    const res = await POST()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to generate support bundle' })
  })

  it('returns 500 when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const res = await POST()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to generate support bundle' })
  })
})
