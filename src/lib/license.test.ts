import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkLicense, _resetCacheForTesting, getLicenseField, logLicenseExpiryWarning } from './license'

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

describe('getLicenseField', () => {
  it('returns null when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })

  it('returns the field value from the SDK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'advanced_stats_enabled', value: 'true' }),
    }))
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBe('true')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://replicated:3000/api/v1/license/fields/advanced_stats_enabled'
    )
  })

  it('returns null when the SDK returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })
})

describe('logLicenseExpiryWarning', () => {
  it('logs a warning when license expires in 3 days', async () => {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: expiresAt } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[license\] warning: expires in 3 days \(\d{4}-\d{2}-\d{2}\)/)
    )
  })

  it('logs a warning when license expires in exactly 7 days', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: expiresAt } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[license\] warning: expires in 7 days/)
    )
  })

  it('does not log when license expires in 8 days', async () => {
    const expiresAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: expiresAt } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when expires_at is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: { expires_at: { value: '' } } }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when SDK returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when REPLICATED_SDK_URL is not set', async () => {
    vi.unstubAllEnvs()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logLicenseExpiryWarning()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
