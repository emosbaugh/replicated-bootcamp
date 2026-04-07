export type LicenseStatus = { valid: true } | { valid: false; reason: string }

interface CacheEntry {
  status: LicenseStatus
  cachedAt: number
}

const CACHE_TTL_MS = 60_000
let cache: CacheEntry | null = null

export function _resetCacheForTesting(): void {
  cache = null
}

export async function checkLicense(): Promise<LicenseStatus> {
  const now = Date.now()
  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache.status
  }

  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) {
    const status: LicenseStatus = { valid: false, reason: 'License service not configured' }
    cache = { status, cachedAt: now }
    return status
  }

  let status: LicenseStatus
  try {
    const res = await fetch(`${sdkUrl}/api/v1/license/info`)
    if (!res.ok) {
      status = { valid: false, reason: 'License service unreachable' }
    } else {
      const data = await res.json()
      const expiresAt: string = data?.entitlements?.expires_at?.value ?? ''
      if (expiresAt && new Date(expiresAt) < new Date()) {
        const formatted = new Date(expiresAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        status = { valid: false, reason: `License expired on ${formatted}` }
      } else {
        status = { valid: true }
      }
    }
  } catch {
    status = { valid: false, reason: 'License service unreachable' }
  }

  cache = { status, cachedAt: now }
  return status
}
