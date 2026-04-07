import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLicenseField } from './license'

describe('getLicenseField', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns null when REPLICATED_SDK_URL is not set', async () => {
    delete process.env.REPLICATED_SDK_URL
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })

  it('returns the field value from the SDK response', async () => {
    process.env.REPLICATED_SDK_URL = 'http://replicated-sdk'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'advanced_stats_enabled', value: 'true' }),
    })
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBe('true')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://replicated-sdk/api/v1/license/fields/advanced_stats_enabled'
    )
  })

  it('returns null when the SDK returns a non-ok response', async () => {
    process.env.REPLICATED_SDK_URL = 'http://replicated-sdk'
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    process.env.REPLICATED_SDK_URL = 'http://replicated-sdk'
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const result = await getLicenseField('advanced_stats_enabled')
    expect(result).toBeNull()
  })
})
