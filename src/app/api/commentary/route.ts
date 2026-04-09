import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateCommentary } from '@/lib/commentary'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const outcome = searchParams.get('outcome') ?? ''
  const batterName = searchParams.get('batter') ?? ''

  const commentary = await generateCommentary(outcome, batterName)
  return NextResponse.json({ commentary })
}
