import { NextResponse } from 'next/server'
import { getLicenseField } from '@/lib/license'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ field: string }> }
) {
  const { field } = await params
  const value = await getLicenseField(field)
  const enabled = value === 'true'
  return NextResponse.json({ enabled })
}
