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
