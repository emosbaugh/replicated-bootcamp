import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { draftTeam } from '@/lib/draft'

export async function POST(req: NextRequest) {
  try {
    const { email, password, franchiseName } = await req.json()

    if (!email || !password || !franchiseName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    let mlbTeamName: string, mlbTeamAbbr: string
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          franchiseName,
        },
      })
      ;({ mlbTeamName, mlbTeamAbbr } = await draftTeam(user.id, tx))
    })

    return NextResponse.json({ success: true, mlbTeamName: mlbTeamName!, mlbTeamAbbr: mlbTeamAbbr! })
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
