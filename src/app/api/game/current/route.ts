import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildGameState } from '@/lib/game-state'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const game = await prisma.game.findFirst({
      where: { userId: session.user.id, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    })

    if (!game) {
      return NextResponse.json({ game: null })
    }

    const state = await buildGameState(game.id, session.user.id)
    return NextResponse.json(state)
  } catch (err) {
    console.error('[game/current]', err)
    return NextResponse.json({ error: 'Failed to load game' }, { status: 500 })
  }
}
