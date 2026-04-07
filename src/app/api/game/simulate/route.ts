import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveAtBat } from '@/lib/game-engine'
import { advanceBases, type Bases } from '@/lib/baserunning'
import { runCpuHalfInning, type CpuBatter, type CpuPitcher } from '@/lib/cpu-runner'
import { buildGameState, invalidateGameStateCache } from '@/lib/game-state'
import { finalizeGame } from '@/lib/game-end'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const game = await prisma.game.findFirst({
      where: { userId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    })
    if (!game) return NextResponse.json({ error: 'No active game' }, { status: 404 })

    const team = await prisma.team.findUnique({ where: { userId }, include: { mlbTeam: true } })
    if (!team) return NextResponse.json({ error: 'No team' }, { status: 400 })

    const batters = await prisma.player.findMany({
      where: { teamId: team.id, mlbPlayer: { lineupOrder: { not: null } } },
      include: { mlbPlayer: true },
      orderBy: { mlbPlayer: { lineupOrder: 'asc' } },
    })

    // Mutable game state for the simulation loop
    let inning = game.inning
    let outs = game.outs
    let homeScore = game.homeScore
    let awayScore = game.awayScore
    let bases = game.runnersOnBase as unknown as Bases
    let lineupPos = game.lineupPosition
    let cpuLineupPos = game.cpuLineupPosition
    let gameLog = game.gameLog as unknown as string[]
    const gameStats = game.gameStats as unknown as Record<string, { ab: number; h: number; hr: number; rbi: number; bb: number; k: number; doubles: number; triples: number }>
    const cpuPitcher = game.cpuPitcher as unknown as CpuPitcher
    const cpuLineup = game.cpuLineup as unknown as CpuBatter[]

    const userPitcherRecord = await prisma.player.findUnique({
      where: { id: game.userPitcherId },
      include: { mlbPlayer: true },
    })
    const userPitcherRating = userPitcherRecord?.mlbPlayer.pitching ?? 5

    let completed = false
    let result: 'user_win' | 'cpu_win' | 'tie' = 'tie'

    // Safety cap to prevent infinite loops
    const MAX_ATBATS = 200
    let atBatCount = 0

    while (!completed && atBatCount < MAX_ATBATS) {
      atBatCount++

      // User at-bat
      const batter = batters[lineupPos % batters.length]
      const mlp = batter.mlbPlayer
      const outcome = resolveAtBat({ contact: mlp.contact, power: mlp.power }, cpuPitcher)
      const basesResult = advanceBases(outcome, bases, batter.id)

      const isHit = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'].includes(outcome)
      const isAB = outcome !== 'WALK'
      const cur = gameStats[batter.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, doubles: 0, triples: 0 }
      gameStats[batter.id] = {
        ...cur,
        ab: isAB ? cur.ab + 1 : cur.ab,
        h: isHit ? cur.h + 1 : cur.h,
        hr: outcome === 'HR' ? cur.hr + 1 : cur.hr,
        rbi: cur.rbi + basesResult.rbi,
        bb: outcome === 'WALK' ? cur.bb + 1 : cur.bb,
        k: outcome === 'STRIKEOUT' ? cur.k + 1 : cur.k,
        doubles: outcome === 'DOUBLE' ? cur.doubles + 1 : cur.doubles,
        triples: outcome === 'TRIPLE' ? cur.triples + 1 : cur.triples,
      }

      outs += basesResult.outRecorded ? 1 : 0
      homeScore += basesResult.runsScored
      bases = basesResult.newBases
      lineupPos = (lineupPos + 1) % batters.length

      if (outs >= 3) {
        const newInning = inning + 1
        const isGameOver = (newInning > 9 && homeScore !== awayScore) || newInning > 12

        if (isGameOver) {
          result = homeScore > awayScore ? 'user_win' : awayScore > homeScore ? 'cpu_win' : 'tie'
          completed = true
          break
        }

        // CPU top of new inning
        const cpuResult = runCpuHalfInning(cpuLineup, { pitching: userPitcherRating }, cpuLineupPos)
        awayScore += cpuResult.score
        gameLog = [...gameLog, ...cpuResult.log]
        cpuLineupPos = cpuResult.newLineupPosition

        const homeWinsAfterTop = newInning > 9 && homeScore > awayScore
        if (homeWinsAfterTop) {
          result = 'user_win'
          completed = true
          inning = newInning
          break
        }

        inning = newInning
        outs = 0
        bases = { first: null, second: null, third: null }
      }
    }

    await invalidateGameStateCache(game.id)

    await prisma.game.update({
      where: { id: game.id },
      data: {
        inning,
        outs,
        homeScore,
        awayScore,
        runnersOnBase: bases as unknown as Parameters<typeof prisma.game.update>[0]['data']['runnersOnBase'],
        lineupPosition: lineupPos,
        cpuLineupPosition: cpuLineupPos,
        gameLog,
        gameStats,
        status: 'completed',
        result,
        completedAt: new Date(),
      },
    })

    await finalizeGame(game.id, userId)
    const state = await buildGameState(game.id, userId)
    return NextResponse.json({ ...state, lastCpuLog: [] })
  } catch (err) {
    console.error('[game/simulate]', err)
    return NextResponse.json({ error: 'Failed to simulate game' }, { status: 500 })
  }
}
