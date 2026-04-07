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
    return { valid: false, reason: 'License service not configured' }
  }

  let status: LicenseStatus
  try {
    const res = await fetch(`${sdkUrl}/api/v1/license/info`)
    if (!res.ok) {
      console.error('[license] SDK returned', res.status)
      status = { valid: false, reason: 'License service unreachable' }
    } else {
      try {
        const data = await res.json() as { entitlements?: { expires_at?: { value?: string } } }
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
      } catch {
        console.error('[license] failed to parse license info response')
        status = { valid: false, reason: 'License service unreachable' }
      }
    }
  } catch (err) {
    console.error('[license] failed to fetch license info:', err)
    status = { valid: false, reason: 'License service unreachable' }
  }

  cache = { status, cachedAt: now }
  return status
}

export async function getLicenseField(name: string): Promise<string | null> {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return null

  try {
    const res = await fetch(`${sdkUrl}/api/v1/license/fields/${name}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.value ?? null
  } catch {
    return null
  }
}
