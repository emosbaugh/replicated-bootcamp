import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkLicense, _resetCacheForTesting } from './license'

beforeEach(() => {
  _resetCacheForTesting()
  vi.stubEnv('REPLICATED_SDK_URL', 'http://replicated:3000')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('checkLicense', () => {
  it('returns invalid when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const result = await checkLicense()
    expect(result).toEqual({ valid: false, reason: 'License service not configured' })
  })

  it('returns invalid when fetch throws (service unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))
    const result = await checkLicense()
    expect(result).toEqual({ valid: false, reason: 'License service unreachable' })
  })

  it('returns invalid when SDK returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const result = await checkLicense()
    expect(result).toEqual({ valid: false, reason: 'License service unreachable' })
  })

  it('returns invalid when expires_at is a past date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entitlements: { expires_at: { value: '2020-01-01T00:00:00Z' } },
      }),
    }))
    const result = await checkLicense()
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toMatch(/^License expired on /)
  })

  it('returns valid when expires_at is empty string (no expiry set)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entitlements: { expires_at: { value: '' } },
      }),
    }))
    const result = await checkLicense()
    expect(result).toEqual({ valid: true })
  })

  it('returns valid when expires_at is a future date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entitlements: { expires_at: { value: '2099-01-01T00:00:00Z' } },
      }),
    }))
    const result = await checkLicense()
    expect(result).toEqual({ valid: true })
  })

  it('caches the result — second call within TTL does not fetch again', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: '' } } }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await checkLicense()
    await checkLicense()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
