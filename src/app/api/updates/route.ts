import { NextResponse } from 'next/server'

export async function GET() {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return NextResponse.json([])

  try {
    const res = await fetch(`${sdkUrl}/api/v1/app/updates`, { cache: 'no-store' })
    if (!res.ok) {
      console.error('[updates] SDK returned', res.status)
      return NextResponse.json([])
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[updates] failed to fetch updates', err)
    return NextResponse.json([])
  }
}
