import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLicenseField } from '@/lib/license'

const ALLOWED_FIELDS = ['advanced_stats_enabled', 'ai_commentary_enabled'] as const
type AllowedField = typeof ALLOWED_FIELDS[number]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ field: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { field } = await params
  if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const value = await getLicenseField(field)
  const enabled = value === 'true'
  return NextResponse.json({ enabled })
}
