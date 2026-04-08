import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) {
    return NextResponse.json({ error: 'SDK not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${sdkUrl}/api/v1/supportbundle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      console.error('[support-bundle] SDK returned', res.status)
      return NextResponse.json(
        { error: 'Failed to generate support bundle' },
        { status: res.status }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[support-bundle] failed to generate bundle', err)
    return NextResponse.json(
      { error: 'Failed to generate support bundle' },
      { status: 500 }
    )
  }
}
