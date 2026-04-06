# Baseball Game Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-player browser baseball game where authenticated users are drafted an MLB team, play turn-by-turn against a CPU opponent, and accumulate season stats tracked in PostgreSQL.

**Architecture:** Next.js 14 App Router + TypeScript throughout. Game state persists as JSON blobs on a single `Game` row (no per-at-bat records). The game engine is a pure TypeScript function — no DB calls — making it fast and testable. `PlayerSeason` stats are written once when a game completes. The CPU's half-inning auto-resolves server-side on the same request that ends the user's half-inning.

**Tech Stack:** Next.js 14, TypeScript, Prisma 5, PostgreSQL 16, NextAuth 4, Tailwind CSS, bcryptjs, Vitest

---

## File Map

```
replicated-bootcamp/   ← repo root
├── docker-compose.yml
├── .env.example
├── vitest.config.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── types/
│   │   └── next-auth.d.ts          — extends Session type with user.id
│   ├── lib/
│   │   ├── db.ts                   — Prisma client singleton
│   │   ├── auth.ts                 — NextAuth config (authOptions)
│   │   ├── game-engine.ts          — resolveAtBat: pure dice + outcome table
│   │   ├── baserunning.ts          — advanceBases: pure base advancement
│   │   ├── cpu-runner.ts           — runCpuHalfInning: pure CPU at-bat loop
│   │   ├── game-state.ts           — buildGameState: DB → GameState shape
│   │   └── draft.ts                — draftTeam: assign MLB team to new user
│   ├── app/
│   │   ├── layout.tsx              — root layout with SessionProvider
│   │   ├── providers.tsx           — client SessionProvider wrapper
│   │   ├── page.tsx                — login page
│   │   ├── signup/
│   │   │   └── page.tsx            — signup + franchise name
│   │   ├── game/
│   │   │   └── page.tsx            — main game screen
│   │   └── stats/
│   │       └── page.tsx            — roster + season stats
│   ├── app/api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/
│   │   │   │   └── route.ts        — NextAuth handler
│   │   │   └── register/
│   │   │       └── route.ts        — POST: create user + draft team
│   │   ├── game/
│   │   │   ├── start/
│   │   │   │   └── route.ts        — POST: create game + run CPU top-of-1st
│   │   │   ├── current/
│   │   │   │   └── route.ts        — GET: load active game state
│   │   │   └── at-bat/
│   │   │       └── route.ts        — POST: user at-bat + auto CPU half-inning
│   │   └── roster/
│   │       └── route.ts            — GET: user's players + season stats
│   └── components/
│       ├── AsciiBoard.tsx          — ASCII game board (<pre> display)
│       └── AsciiStats.tsx          — ASCII stats table (<pre> display)
└── src/lib/
    ├── game-engine.test.ts
    ├── baserunning.test.ts
    └── cpu-runner.test.ts
```

### Key types shared across the app

```typescript
// GameState — returned by /api/game/current and /api/game/at-bat
export interface GameState {
  id: string
  inning: number
  halfInning: 'top' | 'bot'
  outs: number
  homeScore: number    // user (home team)
  awayScore: number    // CPU (away team)
  runnersOnBase: { first: string | null; second: string | null; third: string | null }
  currentBatter: {
    id: string; name: string; position: string; number: number
    contact: number; power: number; speed: number
    gameStats: { ab: number; h: number; hr: number; rbi: number }
    seasonStats: { avg: string; hr: number; rbi: number }
  }
  gameLog: string[]    // last 5 plays (most recent first)
  status: 'in_progress' | 'completed'
  result?: 'user_win' | 'cpu_win' | 'tie'
  userTeam: { name: string; abbr: string; franchiseName: string }
  cpuTeam: { name: string; abbr: string }
  lastCpuLog?: string[]  // plays from most recent CPU half-inning
}
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `baseball-game/` (new Next.js project)
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Modify: `package.json` (add dependencies + scripts)

- [ ] **Step 1: Scaffold the Next.js app into the repo root**

From inside `/Users/ethan/go/src/github.com/emosbaugh/replicated-bootcamp`:
```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint
```
When prompted "Would you like to use Turbopack?" — answer No. When asked about overwriting existing files (README.md), answer Yes.

- [ ] **Step 2: Install dependencies**

```bash
npm install next-auth@4 @auth/prisma-adapter prisma @prisma/client bcryptjs
npm install --save-dev @types/bcryptjs vitest @vitest/coverage-v8
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: baseball
      POSTGRES_PASSWORD: baseball
      POSTGRES_DB: baseball
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:
```

- [ ] **Step 4: Create `.env.example`**

```
DATABASE_URL="postgresql://baseball:baseball@localhost:5432/baseball"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 5: Copy `.env.example` to `.env.local` and fill in values**

```bash
cp .env.example .env.local
# Edit NEXTAUTH_SECRET: openssl rand -base64 32
```

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 7: Add test script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Initialize Prisma**

```bash
npx prisma init
```

- [ ] **Step 9: Start Postgres**

```bash
docker compose up -d
```
Expected: postgres container running on port 5432.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js baseball game project"
```

---

### Task 2: Database Schema

**Files:**
- Create/Replace: `prisma/schema.prisma`

- [ ] **Step 1: Replace `prisma/schema.prisma` with the full schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String
  franchiseName String
  team          Team?
  games         Game[]
  playerSeasons PlayerSeason[]
  createdAt     DateTime       @default(now())
}

model MlbTeam {
  id        String      @id @default(cuid())
  name      String      @unique
  abbr      String      @unique
  players   MlbPlayer[]
  userTeams Team[]
}

model MlbPlayer {
  id        String    @id @default(cuid())
  mlbTeamId String
  mlbTeam   MlbTeam   @relation(fields: [mlbTeamId], references: [id])
  name      String
  position  String
  number    Int
  contact   Int       @default(5)
  power     Int       @default(5)
  speed     Int       @default(5)
  pitching  Int       @default(5)
  isPitcher Boolean   @default(false)
  lineupOrder Int?
  players   Player[]
}

model Team {
  id        String    @id @default(cuid())
  userId    String    @unique
  user      User      @relation(fields: [userId], references: [id])
  mlbTeamId String
  mlbTeam   MlbTeam   @relation(fields: [mlbTeamId], references: [id])
  players   Player[]
}

model Player {
  id           String        @id @default(cuid())
  teamId       String
  team         Team          @relation(fields: [teamId], references: [id])
  mlbPlayerId  String
  mlbPlayer    MlbPlayer     @relation(fields: [mlbPlayerId], references: [id])
  playerSeason PlayerSeason?
}

model Game {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id])
  inning            Int       @default(1)
  halfInning        String    @default("bot")
  outs              Int       @default(0)
  homeScore         Int       @default(0)
  awayScore         Int       @default(0)
  runnersOnBase     Json      @default("{\"first\":null,\"second\":null,\"third\":null}")
  lineupPosition    Int       @default(0)
  cpuLineupPosition Int       @default(0)
  gameLog           Json      @default("[]")
  gameStats         Json      @default("{}")
  cpuGameStats      Json      @default("{}")
  status            String    @default("in_progress")
  cpuTeamName       String
  cpuTeamAbbr       String
  cpuLineup         Json
  cpuPitcher        Json
  userPitcherId     String
  result            String?
  completedAt       DateTime?
  createdAt         DateTime  @default(now())
}

model PlayerSeason {
  id               String   @id @default(cuid())
  playerId         String   @unique
  player           Player   @relation(fields: [playerId], references: [id])
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  games            Int      @default(0)
  atBats           Int      @default(0)
  hits             Int      @default(0)
  doubles          Int      @default(0)
  triples          Int      @default(0)
  homeRuns         Int      @default(0)
  rbi              Int      @default(0)
  walks            Int      @default(0)
  strikeouts       Int      @default(0)
  gamesStarted     Int      @default(0)
  inningsPitched   Float    @default(0)
  hitsAllowed      Int      @default(0)
  walksAllowed     Int      @default(0)
  strikeoutsThrown Int      @default(0)
  earnedRuns       Int      @default(0)
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name init
```
Expected: migration file created, tables created in postgres.

- [ ] **Step 3: Verify tables exist**

```bash
npx prisma studio
```
Open http://localhost:5555 and confirm all 6 tables are present (User, MlbTeam, MlbPlayer, Team, Player, Game, PlayerSeason). Then close studio (Ctrl+C).

- [ ] **Step 4: Create `src/lib/db.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/lib/db.ts
git commit -m "feat: add database schema and Prisma client"
```

---

### Task 3: Roster Seed Data

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add prisma.seed)

- [ ] **Step 1: Add seed script config to `package.json`**

In `package.json`, add at the top level:
```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

Also install ts-node:
```bash
npm install --save-dev ts-node
```

- [ ] **Step 2: Create `prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEAMS = [
  {
    name: 'New York Yankees', abbr: 'NYY',
    batters: [
      { name: 'Aaron Judge',        pos: 'CF',  num: 99, contact: 8, power: 10, speed: 6,  lo: 3 },
      { name: 'Juan Soto',          pos: 'LF',  num: 22, contact: 9, power:  9, speed: 6,  lo: 2 },
      { name: 'Giancarlo Stanton',  pos: 'DH',  num: 27, contact: 6, power: 10, speed: 3,  lo: 4 },
      { name: 'DJ LeMahieu',        pos: '1B',  num: 26, contact: 7, power:  5, speed: 5,  lo: 5 },
      { name: 'Austin Wells',       pos: 'C',   num: 28, contact: 7, power:  7, speed: 4,  lo: 6 },
      { name: 'Alex Verdugo',       pos: 'RF',  num: 24, contact: 7, power:  6, speed: 6,  lo: 7 },
      { name: 'Jazz Chisholm Jr.',  pos: '3B',  num: 13, contact: 7, power:  7, speed: 9,  lo: 1 },
      { name: 'Anthony Volpe',      pos: 'SS',  num: 11, contact: 7, power:  5, speed: 8,  lo: 9 },
      { name: 'Ben Rice',           pos: '2B',  num: 93, contact: 6, power:  6, speed: 6,  lo: 8 },
    ],
    pitcher: { name: 'Gerrit Cole', num: 45, pitching: 9 },
  },
  {
    name: 'Los Angeles Dodgers', abbr: 'LAD',
    batters: [
      { name: 'Mookie Betts',       pos: 'RF',  num: 50, contact: 8, power:  8, speed: 8,  lo: 1 },
      { name: 'Shohei Ohtani',      pos: 'DH',  num: 17, contact: 9, power: 10, speed: 8,  lo: 2 },
      { name: 'Freddie Freeman',    pos: '1B',  num:  5, contact: 9, power:  8, speed: 5,  lo: 3 },
      { name: 'Teoscar Hernandez',  pos: 'LF',  num: 37, contact: 7, power:  8, speed: 6,  lo: 4 },
      { name: 'Will Smith',         pos: 'C',   num: 16, contact: 8, power:  7, speed: 4,  lo: 5 },
      { name: 'Max Muncy',          pos: '3B',  num: 13, contact: 7, power:  8, speed: 4,  lo: 6 },
      { name: 'Gavin Lux',          pos: '2B',  num:  9, contact: 7, power:  5, speed: 6,  lo: 7 },
      { name: 'Miguel Rojas',       pos: 'SS',  num: 11, contact: 6, power:  4, speed: 5,  lo: 8 },
      { name: 'Andy Pages',         pos: 'CF',  num: 44, contact: 6, power:  6, speed: 7,  lo: 9 },
    ],
    pitcher: { name: 'Yoshinobu Yamamoto', num: 18, pitching: 9 },
  },
  {
    name: 'Atlanta Braves', abbr: 'ATL',
    batters: [
      { name: 'Ronald Acuña Jr.',   pos: 'CF',  num: 13, contact: 8, power:  9, speed: 10, lo: 1 },
      { name: 'Ozzie Albies',       pos: '2B',  num:  1, contact: 7, power:  7, speed: 7,  lo: 2 },
      { name: 'Matt Olson',         pos: '1B',  num: 28, contact: 7, power:  9, speed: 4,  lo: 3 },
      { name: 'Austin Riley',       pos: '3B',  num: 27, contact: 7, power:  9, speed: 5,  lo: 4 },
      { name: 'Marcell Ozuna',      pos: 'DH',  num: 20, contact: 8, power:  9, speed: 4,  lo: 5 },
      { name: 'Travis d\'Arnaud',   pos: 'C',   num: 16, contact: 7, power:  6, speed: 3,  lo: 6 },
      { name: 'Michael Harris II',  pos: 'LF',  num: 23, contact: 7, power:  7, speed: 8,  lo: 7 },
      { name: 'Eli White',          pos: 'RF',  num: 41, contact: 6, power:  5, speed: 7,  lo: 8 },
      { name: 'Orlando Arcia',      pos: 'SS',  num: 11, contact: 6, power:  5, speed: 5,  lo: 9 },
    ],
    pitcher: { name: 'Spencer Strider', num: 99, pitching: 9 },
  },
  {
    name: 'Houston Astros', abbr: 'HOU',
    batters: [
      { name: 'Jose Altuve',        pos: '2B',  num: 27, contact: 8, power:  7, speed: 7,  lo: 1 },
      { name: 'Kyle Tucker',        pos: 'LF',  num: 30, contact: 8, power:  8, speed: 6,  lo: 2 },
      { name: 'Yordan Alvarez',     pos: 'DH',  num: 44, contact: 8, power: 10, speed: 4,  lo: 3 },
      { name: 'Alex Bregman',       pos: '3B',  num:  2, contact: 8, power:  7, speed: 5,  lo: 4 },
      { name: 'Jeremy Peña',        pos: 'SS',  num:  3, contact: 7, power:  6, speed: 6,  lo: 5 },
      { name: 'Yainer Diaz',        pos: 'C',   num: 21, contact: 7, power:  7, speed: 4,  lo: 6 },
      { name: 'Jon Singleton',      pos: '1B',  num: 28, contact: 6, power:  7, speed: 4,  lo: 7 },
      { name: 'Mauricio Dubón',     pos: 'CF',  num: 14, contact: 6, power:  4, speed: 7,  lo: 8 },
      { name: 'Jake Meyers',        pos: 'RF',  num:  6, contact: 6, power:  5, speed: 7,  lo: 9 },
    ],
    pitcher: { name: 'Framber Valdez', num: 59, pitching: 8 },
  },
  {
    name: 'Philadelphia Phillies', abbr: 'PHI',
    batters: [
      { name: 'Trea Turner',        pos: 'SS',  num:  7, contact: 8, power:  7, speed: 9,  lo: 1 },
      { name: 'Weston Wilson',      pos: 'DH',  num:  9, contact: 6, power:  5, speed: 5,  lo: 2 },
      { name: 'Bryce Harper',       pos: '1B',  num:  3, contact: 9, power:  9, speed: 6,  lo: 3 },
      { name: 'Kyle Schwarber',     pos: 'LF',  num: 12, contact: 7, power:  9, speed: 5,  lo: 4 },
      { name: 'Nick Castellanos',   pos: 'RF',  num:  8, contact: 8, power:  7, speed: 5,  lo: 5 },
      { name: 'JT Realmuto',        pos: 'C',   num: 10, contact: 7, power:  7, speed: 6,  lo: 6 },
      { name: 'Alec Bohm',          pos: '3B',  num: 28, contact: 7, power:  7, speed: 5,  lo: 7 },
      { name: 'Bryson Stott',       pos: '2B',  num:  5, contact: 7, power:  5, speed: 7,  lo: 8 },
      { name: 'Johan Rojas',        pos: 'CF',  num: 18, contact: 6, power:  4, speed: 8,  lo: 9 },
    ],
    pitcher: { name: 'Zack Wheeler', num: 45, pitching: 9 },
  },
  {
    name: 'Boston Red Sox', abbr: 'BOS',
    batters: [
      { name: 'Jarren Duran',       pos: 'CF',  num: 16, contact: 8, power:  7, speed: 9,  lo: 1 },
      { name: 'Trevor Story',       pos: '2B',  num:  2, contact: 7, power:  7, speed: 6,  lo: 2 },
      { name: 'Rafael Devers',      pos: '3B',  num: 11, contact: 8, power:  9, speed: 5,  lo: 3 },
      { name: 'Triston Casas',      pos: '1B',  num: 36, contact: 7, power:  8, speed: 4,  lo: 4 },
      { name: 'Tyler O\'Neill',     pos: 'LF',  num: 10, contact: 7, power:  8, speed: 6,  lo: 5 },
      { name: 'Connor Wong',        pos: 'C',   num: 12, contact: 6, power:  6, speed: 5,  lo: 6 },
      { name: 'Rob Refsnyder',      pos: 'RF',  num: 30, contact: 7, power:  5, speed: 6,  lo: 7 },
      { name: 'Ceddanne Rafaela',   pos: 'DH',  num: 43, contact: 6, power:  5, speed: 8,  lo: 8 },
      { name: 'David Hamilton',     pos: 'SS',  num: 70, contact: 6, power:  4, speed: 9,  lo: 9 },
    ],
    pitcher: { name: 'Brayan Bello', num: 66, pitching: 7 },
  },
]

// Generic bench players added to each team to fill 25-man roster
const BENCH_TEMPLATES = [
  { suffix: 'B1', pos: 'C',   contact: 5, power: 4, speed: 4, isPitcher: false },
  { suffix: 'B2', pos: 'IF',  contact: 5, power: 5, speed: 5, isPitcher: false },
  { suffix: 'B3', pos: 'OF',  contact: 5, power: 4, speed: 6, isPitcher: false },
  { suffix: 'B4', pos: 'IF',  contact: 6, power: 4, speed: 5, isPitcher: false },
  { suffix: 'B5', pos: 'OF',  contact: 5, power: 5, speed: 6, isPitcher: false },
  { suffix: 'SP', pos: 'SP',  contact: 1, power: 1, speed: 1, pitching: 7, isPitcher: true },
  { suffix: 'SP2', pos: 'SP', contact: 1, power: 1, speed: 1, pitching: 6, isPitcher: true },
  { suffix: 'RP1', pos: 'RP', contact: 1, power: 1, speed: 1, pitching: 7, isPitcher: true },
  { suffix: 'RP2', pos: 'RP', contact: 1, power: 1, speed: 1, pitching: 6, isPitcher: true },
  { suffix: 'RP3', pos: 'RP', contact: 1, power: 1, speed: 1, pitching: 6, isPitcher: true },
  { suffix: 'CL',  pos: 'CL', contact: 1, power: 1, speed: 1, pitching: 8, isPitcher: true },
  { suffix: 'B6',  pos: 'OF', contact: 5, power: 4, speed: 5, isPitcher: false },
  { suffix: 'B7',  pos: 'IF', contact: 5, power: 5, speed: 4, isPitcher: false },
  { suffix: 'B8',  pos: '1B', contact: 5, power: 6, speed: 4, isPitcher: false },
  { suffix: 'B9',  pos: 'C',  contact: 5, power: 4, speed: 4, isPitcher: false },
]

async function main() {
  console.log('Seeding MLB teams and players...')

  for (const teamData of TEAMS) {
    const team = await prisma.mlbTeam.upsert({
      where: { abbr: teamData.abbr },
      update: {},
      create: { name: teamData.name, abbr: teamData.abbr },
    })

    let playerNum = 100
    for (const b of teamData.batters) {
      await prisma.mlbPlayer.upsert({
        where: { id: `${teamData.abbr}-${b.num}` },
        update: {},
        create: {
          id: `${teamData.abbr}-${b.num}`,
          mlbTeamId: team.id,
          name: b.name,
          position: b.pos,
          number: b.num,
          contact: b.contact,
          power: b.power,
          speed: b.speed,
          pitching: 1,
          isPitcher: false,
          lineupOrder: b.lo,
        },
      })
    }

    const p = teamData.pitcher
    await prisma.mlbPlayer.upsert({
      where: { id: `${teamData.abbr}-${p.num}` },
      update: {},
      create: {
        id: `${teamData.abbr}-${p.num}`,
        mlbTeamId: team.id,
        name: p.name,
        position: 'SP',
        number: p.num,
        contact: 1,
        power: 1,
        speed: 1,
        pitching: p.pitching,
        isPitcher: true,
        lineupOrder: null,
      },
    })

    for (const bench of BENCH_TEMPLATES) {
      await prisma.mlbPlayer.upsert({
        where: { id: `${teamData.abbr}-bench-${bench.suffix}` },
        update: {},
        create: {
          id: `${teamData.abbr}-bench-${bench.suffix}`,
          mlbTeamId: team.id,
          name: `${teamData.abbr} ${bench.suffix}`,
          position: bench.pos,
          number: playerNum++,
          contact: bench.contact,
          power: bench.power,
          speed: bench.speed,
          pitching: (bench as any).pitching ?? 1,
          isPitcher: bench.isPitcher,
          lineupOrder: null,
        },
      })
    }

    console.log(`  ✓ ${teamData.name} (${team.id})`)
  }

  console.log('Done.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: Run the seed**

```bash
npx prisma db seed
```
Expected output:
```
Seeding MLB teams and players...
  ✓ New York Yankees (...)
  ✓ Los Angeles Dodgers (...)
  ✓ Atlanta Braves (...)
  ✓ Houston Astros (...)
  ✓ Philadelphia Phillies (...)
  ✓ Boston Red Sox (...)
Done.
```

- [ ] **Step 4: Verify seed with a quick query**

```bash
npx prisma studio
```
Open http://localhost:5555 → MlbTeam: confirm 6 rows. MlbPlayer: confirm ~150 rows. Close studio.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: add MLB roster seed data for 6 teams"
```

---

### Task 4: Auth Setup

**Files:**
- Create: `src/types/next-auth.d.ts`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/lib/draft.ts`

- [ ] **Step 1: Create `src/types/next-auth.d.ts`**

```typescript
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
  }
}
```

- [ ] **Step 2: Create `src/lib/auth.ts`**

```typescript
import { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.franchiseName }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token && session.user) session.user.id = token.id
      return session
    },
  },
}
```

- [ ] **Step 3: Create `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

- [ ] **Step 4: Create `src/lib/draft.ts`**

```typescript
import { prisma } from '@/lib/db'

// Assign a random MLB team's roster to a new user.
// Creates Player records (one per MlbPlayer) and PlayerSeason records.
// Returns the created Team.
export async function draftTeam(userId: string): Promise<{ mlbTeamName: string; mlbTeamAbbr: string }> {
  // Pick a random MLB team
  const teams = await prisma.mlbTeam.findMany({ select: { id: true, name: true, abbr: true } })
  const mlbTeam = teams[Math.floor(Math.random() * teams.length)]

  const mlbPlayers = await prisma.mlbPlayer.findMany({
    where: { mlbTeamId: mlbTeam.id },
  })

  // Create the user's Team
  const team = await prisma.team.create({
    data: {
      userId,
      mlbTeamId: mlbTeam.id,
    },
  })

  // Clone each MlbPlayer into a Player for this team
  for (const mlbPlayer of mlbPlayers) {
    const player = await prisma.player.create({
      data: {
        teamId: team.id,
        mlbPlayerId: mlbPlayer.id,
      },
    })
    await prisma.playerSeason.create({
      data: {
        playerId: player.id,
        userId,
      },
    })
  }

  return { mlbTeamName: mlbTeam.name, mlbTeamAbbr: mlbTeam.abbr }
}
```

- [ ] **Step 5: Create `src/app/api/auth/register/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { draftTeam } from '@/lib/draft'

export async function POST(req: NextRequest) {
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
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      franchiseName,
    },
  })

  const { mlbTeamName, mlbTeamAbbr } = await draftTeam(user.id)

  return NextResponse.json({ success: true, mlbTeamName, mlbTeamAbbr })
}
```

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: add NextAuth credentials + register endpoint + team draft"
```

---

### Task 5: Game Engine

**Files:**
- Create: `src/lib/game-engine.ts`
- Create: `src/lib/game-engine.test.ts`

- [ ] **Step 1: Write failing tests in `src/lib/game-engine.test.ts`**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveAtBat } from './game-engine'

afterEach(() => vi.restoreAllMocks())

function mockRoll(die1: number, die2: number) {
  // Math.floor(Math.random() * 6) + 1 for each die
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce((die1 - 1) / 6)
    .mockReturnValueOnce((die2 - 1) / 6)
}

describe('resolveAtBat', () => {
  it('returns HR on roll 12 with no modifiers (contact=5, power=5, pitching=1)', () => {
    mockRoll(6, 6) // roll 12
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('HR')
  })

  it('returns STRIKEOUT on roll 2 with no modifiers', () => {
    mockRoll(1, 1) // roll 2
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('STRIKEOUT')
  })

  it('returns SINGLE on roll 8 with average batter vs weak pitcher', () => {
    mockRoll(4, 4) // roll 8
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('SINGLE')
  })

  it('high contact batter shifts roll up toward hits', () => {
    // contact=10 gives +2 bonus
    // roll 6 + 2 = 8 → SINGLE
    mockRoll(3, 3) // roll 6 → FLYOUT without bonus
    const result = resolveAtBat({ contact: 10, power: 5 }, { pitching: 1 })
    expect(result).toBe('SINGLE') // 6 + 2 contact bonus = 8 → SINGLE
  })

  it('ace pitcher reduces roll toward outs', () => {
    // pitching=10 gives -2 penalty
    // roll 8 - 2 = 6 → FLYOUT instead of SINGLE
    mockRoll(4, 4) // roll 8 → SINGLE without penalty
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 10 })
    expect(result).toBe('FLYOUT') // 8 - 2 = 6 → FLYOUT
  })

  it('clamps adjusted roll to 2 minimum', () => {
    // contact=1, power=1, pitching=10: adj = -2 + -1 + -2 = -5, roll 2 → max(2, 2-5)=2
    mockRoll(1, 1) // roll 2
    expect(resolveAtBat({ contact: 1, power: 1 }, { pitching: 10 })).toBe('STRIKEOUT')
  })

  it('clamps adjusted roll to 12 maximum', () => {
    // contact=10, power=10, pitching=1: adj = +2+1-0=3, roll 12 → min(12,15)=12
    mockRoll(6, 6) // roll 12
    expect(resolveAtBat({ contact: 10, power: 10 }, { pitching: 1 })).toBe('HR')
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npm test
```
Expected: FAIL with "Cannot find module './game-engine'"

- [ ] **Step 3: Create `src/lib/game-engine.ts`**

```typescript
export type Outcome =
  | 'HR' | 'TRIPLE' | 'DOUBLE' | 'SINGLE'
  | 'WALK' | 'STRIKEOUT' | 'GROUNDOUT' | 'FLYOUT'

// 2d6 outcome table. Rolls 2-12, mapping to baseball outcomes.
// Higher rolls → hits/extra bases; lower rolls → outs.
const OUTCOME_TABLE: Record<number, Outcome> = {
  2:  'STRIKEOUT',
  3:  'STRIKEOUT',
  4:  'GROUNDOUT',
  5:  'GROUNDOUT',
  6:  'FLYOUT',
  7:  'GROUNDOUT',
  8:  'SINGLE',
  9:  'FLYOUT',
  10: 'DOUBLE',
  11: 'WALK',
  12: 'HR',
}

function rollDice(): number {
  return (
    Math.floor(Math.random() * 6) + 1 +
    Math.floor(Math.random() * 6) + 1
  )
}

// contact 1–10 → adjustment −2 to +2
function contactBonus(contact: number): number {
  return Math.round((contact - 5.5) / 2.25)
}

// power 1–10 → adjustment −1 to +1
function powerBonus(power: number): number {
  return Math.round((power - 5.5) / 4.5)
}

// pitching 1–10 → penalty 0 to 2 (good pitcher lowers roll)
function pitcherPenalty(pitching: number): number {
  return Math.round((pitching - 1) / 4.5)
}

export function resolveAtBat(
  batter: { contact: number; power: number },
  pitcher: { pitching: number }
): Outcome {
  const roll = rollDice()
  const adj =
    contactBonus(batter.contact) +
    powerBonus(batter.power) -
    pitcherPenalty(pitcher.pitching)
  const adjusted = Math.max(2, Math.min(12, roll + adj))
  return OUTCOME_TABLE[adjusted]
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-engine.ts src/lib/game-engine.test.ts
git commit -m "feat: add game engine with outcome table and tests"
```

---

### Task 6: Baserunning Logic

**Files:**
- Create: `src/lib/baserunning.ts`
- Create: `src/lib/baserunning.test.ts`

- [ ] **Step 1: Write failing tests in `src/lib/baserunning.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { advanceBases } from './baserunning'

const EMPTY: import('./baserunning').Bases = { first: null, second: null, third: null }

describe('advanceBases', () => {
  it('HR scores all runners including batter', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('HR', bases, 'batter')
    expect(r.runsScored).toBe(4)
    expect(r.rbi).toBe(4)
    expect(r.newBases).toEqual(EMPTY)
    expect(r.outRecorded).toBe(false)
  })

  it('solo HR scores 1 run from empty bases', () => {
    const r = advanceBases('HR', EMPTY, 'batter')
    expect(r.runsScored).toBe(1)
    expect(r.rbi).toBe(1)
    expect(r.newBases).toEqual(EMPTY)
  })

  it('TRIPLE clears bases and puts batter on third', () => {
    const bases = { first: 'p1', second: null, third: 'p3' }
    const r = advanceBases('TRIPLE', bases, 'batter')
    expect(r.runsScored).toBe(2)
    expect(r.newBases).toEqual({ first: null, second: null, third: 'batter' })
  })

  it('DOUBLE scores runners on second and third, runner on first to third', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('DOUBLE', bases, 'batter')
    expect(r.runsScored).toBe(2)   // p2 and p3 score
    expect(r.rbi).toBe(2)
    expect(r.newBases).toEqual({ first: null, second: 'batter', third: 'p1' })
  })

  it('SINGLE advances all runners one base, scores runner from third', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('SINGLE', bases, 'batter')
    expect(r.runsScored).toBe(1)   // p3 scores
    expect(r.rbi).toBe(1)
    expect(r.newBases).toEqual({ first: 'batter', second: 'p1', third: 'p2' })
  })

  it('WALK with bases loaded scores runner from third', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('WALK', bases, 'batter')
    expect(r.runsScored).toBe(1)
    expect(r.rbi).toBe(1)
    expect(r.newBases).toEqual({ first: 'batter', second: 'p1', third: 'p2' })
  })

  it('WALK with only first occupied forces runner to second', () => {
    const bases = { first: 'p1', second: null, third: null }
    const r = advanceBases('WALK', bases, 'batter')
    expect(r.runsScored).toBe(0)
    expect(r.newBases).toEqual({ first: 'batter', second: 'p1', third: null })
  })

  it('WALK with empty bases puts batter on first only', () => {
    const r = advanceBases('WALK', EMPTY, 'batter')
    expect(r.newBases).toEqual({ first: 'batter', second: null, third: null })
  })

  it('STRIKEOUT records an out and does not move runners', () => {
    const bases = { first: 'p1', second: null, third: null }
    const r = advanceBases('STRIKEOUT', bases, 'batter')
    expect(r.outRecorded).toBe(true)
    expect(r.runsScored).toBe(0)
    expect(r.newBases).toEqual(bases)
  })

  it('GROUNDOUT records an out and does not move runners', () => {
    const r = advanceBases('GROUNDOUT', EMPTY, 'batter')
    expect(r.outRecorded).toBe(true)
    expect(r.runsScored).toBe(0)
  })

  it('FLYOUT records an out and does not move runners', () => {
    const r = advanceBases('FLYOUT', EMPTY, 'batter')
    expect(r.outRecorded).toBe(true)
    expect(r.runsScored).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npm test
```
Expected: FAIL with "Cannot find module './baserunning'"

- [ ] **Step 3: Create `src/lib/baserunning.ts`**

```typescript
import { type Outcome } from './game-engine'

export interface Bases {
  first: string | null
  second: string | null
  third: string | null
}

export interface BasesResult {
  newBases: Bases
  runsScored: number
  rbi: number
  outRecorded: boolean
}

export function advanceBases(
  outcome: Outcome,
  bases: Bases,
  batterId: string
): BasesResult {
  switch (outcome) {
    case 'HR': {
      const runnersScoring = [bases.first, bases.second, bases.third].filter(Boolean).length
      return {
        newBases: { first: null, second: null, third: null },
        runsScored: runnersScoring + 1,
        rbi: runnersScoring + 1,
        outRecorded: false,
      }
    }

    case 'TRIPLE': {
      const runnersScoring = [bases.first, bases.second, bases.third].filter(Boolean).length
      return {
        newBases: { first: null, second: null, third: batterId },
        runsScored: runnersScoring,
        rbi: runnersScoring,
        outRecorded: false,
      }
    }

    case 'DOUBLE': {
      const runnersScoring = [bases.second, bases.third].filter(Boolean).length
      return {
        newBases: { first: null, second: batterId, third: bases.first },
        runsScored: runnersScoring,
        rbi: runnersScoring,
        outRecorded: false,
      }
    }

    case 'SINGLE': {
      const runsScored = bases.third ? 1 : 0
      return {
        newBases: { first: batterId, second: bases.first, third: bases.second },
        runsScored,
        rbi: runsScored,
        outRecorded: false,
      }
    }

    case 'WALK': {
      if (bases.first && bases.second && bases.third) {
        return {
          newBases: { first: batterId, second: bases.first, third: bases.second },
          runsScored: 1,
          rbi: 1,
          outRecorded: false,
        }
      }
      if (bases.first && bases.second) {
        return {
          newBases: { first: batterId, second: bases.first, third: bases.second },
          runsScored: 0,
          rbi: 0,
          outRecorded: false,
        }
      }
      if (bases.first) {
        return {
          newBases: { first: batterId, second: bases.first, third: bases.third },
          runsScored: 0,
          rbi: 0,
          outRecorded: false,
        }
      }
      return {
        newBases: { first: batterId, second: bases.second, third: bases.third },
        runsScored: 0,
        rbi: 0,
        outRecorded: false,
      }
    }

    case 'GROUNDOUT':
    case 'FLYOUT':
    case 'STRIKEOUT':
      return {
        newBases: { ...bases },
        runsScored: 0,
        rbi: 0,
        outRecorded: true,
      }
  }
}

export function describePlay(name: string, outcome: Outcome, runsScored: number): string {
  const lastName = name.split(' ').at(-1) ?? name
  switch (outcome) {
    case 'HR':
      return runsScored === 1
        ? `${lastName} — Solo HR`
        : `${lastName} — ${runsScored}-run HR`
    case 'TRIPLE':
      return runsScored > 0
        ? `${lastName} — Triple, ${runsScored} score`
        : `${lastName} — Triple`
    case 'DOUBLE':
      return runsScored > 0
        ? `${lastName} — Double, ${runsScored} score`
        : `${lastName} — Double`
    case 'SINGLE':
      return runsScored > 0
        ? `${lastName} — Single, scores`
        : `${lastName} — Single`
    case 'WALK':
      return runsScored > 0
        ? `${lastName} — Walk, scores`
        : `${lastName} — Walk`
    case 'GROUNDOUT': return `${lastName} — Groundout`
    case 'FLYOUT':    return `${lastName} — Flyout`
    case 'STRIKEOUT': return `${lastName} — Strikeout`
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/baserunning.ts src/lib/baserunning.test.ts
git commit -m "feat: add baserunning logic with tests"
```

---

### Task 7: CPU Runner + Game State Helpers

**Files:**
- Create: `src/lib/cpu-runner.ts`
- Create: `src/lib/cpu-runner.test.ts`
- Create: `src/lib/game-state.ts`

- [ ] **Step 1: Write failing tests in `src/lib/cpu-runner.test.ts`**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runCpuHalfInning } from './cpu-runner'

afterEach(() => vi.restoreAllMocks())

const LINEUP = Array.from({ length: 9 }, (_, i) => ({
  id: `cpu-${i}`,
  name: `Player ${i + 1}`,
  contact: 5,
  power: 5,
}))

const PITCHER = { pitching: 5 }

describe('runCpuHalfInning', () => {
  it('runs until 3 outs and returns score and log', () => {
    // Force all groundouts (roll 7 each time → GROUNDOUT after -1 avg pitcher penalty)
    // pitch=5 → penalty=1, roll=7, adj=6 → FLYOUT
    // Mock: always roll (3,4)=7, adj with pitching=5 penalty=1 → 6 → FLYOUT = out
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // die=4 each time → roll=8, adj=7=GROUNDOUT
    const result = runCpuHalfInning(LINEUP, PITCHER, 0)
    expect(result.log.length).toBeGreaterThanOrEqual(3)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.newLineupPosition).toBeGreaterThan(0)
  })

  it('wraps lineup position past 9', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    // Start at position 8 (last batter), should wrap back
    const result = runCpuHalfInning(LINEUP, PITCHER, 8)
    expect(result.newLineupPosition).toBeLessThan(9)
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npm test
```
Expected: FAIL with "Cannot find module './cpu-runner'"

- [ ] **Step 3: Create `src/lib/cpu-runner.ts`**

```typescript
import { resolveAtBat } from './game-engine'
import { advanceBases, describePlay, type Bases } from './baserunning'

export interface CpuBatter {
  id: string
  name: string
  contact: number
  power: number
}

export interface CpuPitcher {
  pitching: number
}

export interface CpuHalfInningResult {
  score: number
  log: string[]
  newLineupPosition: number
}

export function runCpuHalfInning(
  lineup: CpuBatter[],
  pitcher: CpuPitcher,
  startPosition: number
): CpuHalfInningResult {
  let outs = 0
  let bases: Bases = { first: null, second: null, third: null }
  let score = 0
  let position = startPosition
  const log: string[] = []

  while (outs < 3) {
    const batter = lineup[position % 9]
    const outcome = resolveAtBat(batter, pitcher)
    const result = advanceBases(outcome, bases, batter.id)

    bases = result.newBases
    score += result.runsScored
    if (result.outRecorded) outs++
    log.push(describePlay(batter.name, outcome, result.runsScored))
    position++
  }

  return { score, log, newLineupPosition: position % 9 }
}
```

- [ ] **Step 4: Create `src/lib/game-state.ts`**

```typescript
import { prisma } from '@/lib/db'
import type { GameState } from '@/app/api/game/types'

// Build the GameState response shape from a Game row.
// Loads the current batter's player info and season stats.
export async function buildGameState(gameId: string, userId: string): Promise<GameState | null> {
  const game = await prisma.game.findFirst({
    where: { id: gameId, userId },
  })
  if (!game) return null

  // Get user's team info
  const team = await prisma.team.findUnique({
    where: { userId },
    include: { mlbTeam: true },
  })
  if (!team) return null

  // Get batting lineup (players with lineupOrder 1-9, sorted)
  const lineup = await prisma.player.findMany({
    where: { teamId: team.id },
    include: {
      mlbPlayer: true,
      playerSeason: true,
    },
    orderBy: { mlbPlayer: { lineupOrder: 'asc' } },
  })
  const batters = lineup.filter((p) => p.mlbPlayer.lineupOrder !== null)

  const currentPlayer = batters[game.lineupPosition % batters.length]
  if (!currentPlayer) return null

  const mlp = currentPlayer.mlbPlayer
  const season = currentPlayer.playerSeason

  const gameStats = game.gameStats as Record<string, { ab: number; h: number; hr: number; rbi: number }>
  const myGameStats = gameStats[currentPlayer.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0 }

  const avg = season && season.atBats > 0
    ? (season.hits / season.atBats).toFixed(3).replace('0.', '.')
    : '.000'

  const gameLog = game.gameLog as string[]

  return {
    id: game.id,
    inning: game.inning,
    halfInning: game.halfInning as 'top' | 'bot',
    outs: game.outs,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    runnersOnBase: game.runnersOnBase as GameState['runnersOnBase'],
    currentBatter: {
      id: currentPlayer.id,
      name: mlp.name,
      position: mlp.position,
      number: mlp.number,
      contact: mlp.contact,
      power: mlp.power,
      speed: mlp.speed,
      gameStats: myGameStats,
      seasonStats: {
        avg,
        hr: season?.homeRuns ?? 0,
        rbi: season?.rbi ?? 0,
      },
    },
    gameLog: gameLog.slice(-5).reverse(),
    status: game.status as 'in_progress' | 'completed',
    result: game.result as GameState['result'],
    userTeam: {
      name: team.mlbTeam.name,
      abbr: team.mlbTeam.abbr,
      franchiseName: (await prisma.user.findUnique({ where: { id: userId }, select: { franchiseName: true } }))!.franchiseName,
    },
    cpuTeam: {
      name: game.cpuTeamName,
      abbr: game.cpuTeamAbbr,
    },
    lastCpuLog: undefined,
  }
}
```

- [ ] **Step 5: Create the shared types file `src/app/api/game/types.ts`**

```typescript
export interface GameState {
  id: string
  inning: number
  halfInning: 'top' | 'bot'
  outs: number
  homeScore: number
  awayScore: number
  runnersOnBase: { first: string | null; second: string | null; third: string | null }
  currentBatter: {
    id: string
    name: string
    position: string
    number: number
    contact: number
    power: number
    speed: number
    gameStats: { ab: number; h: number; hr: number; rbi: number }
    seasonStats: { avg: string; hr: number; rbi: number }
  }
  gameLog: string[]
  status: 'in_progress' | 'completed'
  result?: 'user_win' | 'cpu_win' | 'tie'
  userTeam: { name: string; abbr: string; franchiseName: string }
  cpuTeam: { name: string; abbr: string }
  lastCpuLog?: string[]
}
```

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cpu-runner.ts src/lib/cpu-runner.test.ts src/lib/game-state.ts src/app/api/game/types.ts
git commit -m "feat: add CPU runner, game state builder, and shared types"
```

---

### Task 8: Start Game API Route

**Files:**
- Create: `src/app/api/game/start/route.ts`

- [ ] **Step 1: Create `src/app/api/game/start/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runCpuHalfInning } from '@/lib/cpu-runner'
import { buildGameState } from '@/lib/game-state'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  // Check for existing in-progress game
  const existing = await prisma.game.findFirst({
    where: { userId, status: 'in_progress' },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) {
    const state = await buildGameState(existing.id, userId)
    return NextResponse.json(state)
  }

  // Pick a random CPU team (different from user's team if possible)
  const userTeam = await prisma.team.findUnique({
    where: { userId },
    include: { mlbTeam: true },
  })
  if (!userTeam) {
    return NextResponse.json({ error: 'No team found' }, { status: 400 })
  }

  const allTeams = await prisma.mlbTeam.findMany({
    include: {
      players: {
        where: { isPitcher: false, lineupOrder: { not: null } },
        orderBy: { lineupOrder: 'asc' },
      },
    },
  })
  const cpuOptions = allTeams.filter((t) => t.id !== userTeam.mlbTeamId)
  const cpuMlbTeam = cpuOptions[Math.floor(Math.random() * cpuOptions.length)]

  // Build CPU lineup JSON (9 batters ordered by lineupOrder)
  const cpuBatters = cpuMlbTeam.players
    .filter((p) => !p.isPitcher && p.lineupOrder !== null)
    .sort((a, b) => (a.lineupOrder ?? 0) - (b.lineupOrder ?? 0))
    .slice(0, 9)
    .map((p) => ({ id: p.id, name: p.name, contact: p.contact, power: p.power }))

  // CPU pitcher is the SP on the team
  const cpuPitcherRecord = await prisma.mlbPlayer.findFirst({
    where: { mlbTeamId: cpuMlbTeam.id, isPitcher: true, position: 'SP' },
  })
  const cpuPitcher = cpuPitcherRecord
    ? { id: cpuPitcherRecord.id, name: cpuPitcherRecord.name, pitching: cpuPitcherRecord.pitching }
    : { id: 'default', name: 'CPU Pitcher', pitching: 5 }

  // User's starting pitcher (first SP in their roster)
  const userPitcher = await prisma.player.findFirst({
    where: { teamId: userTeam.id },
    include: { mlbPlayer: true },
    orderBy: { mlbPlayer: { pitching: 'desc' } },
  })
  // Filter to only pitchers
  const userPitcherPlayer = await prisma.player.findFirst({
    where: {
      teamId: userTeam.id,
      mlbPlayer: { isPitcher: true, position: 'SP' },
    },
    include: { mlbPlayer: true },
  })

  if (!userPitcherPlayer) {
    return NextResponse.json({ error: 'No pitcher found in roster' }, { status: 400 })
  }

  // Run CPU's top of 1st inning
  const cpuResult = runCpuHalfInning(
    cpuBatters,
    { pitching: userPitcherPlayer.mlbPlayer.pitching },
    0
  )

  // Create the game (starting at bot of 1st after CPU has batted)
  const game = await prisma.game.create({
    data: {
      userId,
      inning: 1,
      halfInning: 'bot',
      outs: 0,
      homeScore: 0,
      awayScore: cpuResult.score,
      runnersOnBase: { first: null, second: null, third: null },
      lineupPosition: 0,
      cpuLineupPosition: cpuResult.newLineupPosition,
      gameLog: cpuResult.log,
      gameStats: {},
      cpuGameStats: {},
      cpuTeamName: cpuMlbTeam.name,
      cpuTeamAbbr: cpuMlbTeam.abbr,
      cpuLineup: cpuBatters,
      cpuPitcher,
      userPitcherId: userPitcherPlayer.id,
    },
  })

  const state = await buildGameState(game.id, userId)
  if (!state) return NextResponse.json({ error: 'Failed to build game state' }, { status: 500 })

  return NextResponse.json({ ...state, lastCpuLog: cpuResult.log })
}
```

- [ ] **Step 2: Create `src/app/api/game/current/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildGameState } from '@/lib/game-state'

export async function GET(req: NextRequest) {
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
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/game/start/ src/app/api/game/current/
git commit -m "feat: add start game and current game API routes"
```

---

### Task 9: At-Bat API Route

**Files:**
- Create: `src/app/api/game/at-bat/route.ts`

This is the core route: processes one user plate appearance, then auto-runs CPU half-inning if needed.

- [ ] **Step 1: Create `src/app/api/game/at-bat/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveAtBat } from '@/lib/game-engine'
import { advanceBases, describePlay, type Bases } from '@/lib/baserunning'
import { runCpuHalfInning, type CpuBatter, type CpuPitcher } from '@/lib/cpu-runner'
import { buildGameState } from '@/lib/game-state'
import { finalizeGame } from '@/lib/game-end'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const game = await prisma.game.findFirst({
    where: { userId, status: 'in_progress' },
    orderBy: { createdAt: 'desc' },
  })
  if (!game) {
    return NextResponse.json({ error: 'No active game' }, { status: 404 })
  }

  // Load user's batting lineup
  const team = await prisma.team.findUnique({
    where: { userId },
    include: { mlbTeam: true },
  })
  if (!team) return NextResponse.json({ error: 'No team' }, { status: 400 })

  const batters = await prisma.player.findMany({
    where: { teamId: team.id, mlbPlayer: { lineupOrder: { not: null } } },
    include: { mlbPlayer: true },
    orderBy: { mlbPlayer: { lineupOrder: 'asc' } },
  })

  const currentBatter = batters[game.lineupPosition % batters.length]
  const mlp = currentBatter.mlbPlayer

  // CPU pitcher from JSON
  const cpuPitcher = game.cpuPitcher as CpuPitcher

  // Resolve the at-bat
  const outcome = resolveAtBat(
    { contact: mlp.contact, power: mlp.power },
    cpuPitcher
  )

  const currentBases = game.runnersOnBase as Bases
  const basesResult = advanceBases(outcome, currentBases, currentBatter.id)
  const playDesc = describePlay(mlp.name, outcome, basesResult.runsScored)

  // Update game stats
  const gameStats = game.gameStats as Record<string, { ab: number; h: number; hr: number; rbi: number; bb: number; k: number; doubles: number; triples: number }>
  const myStats = gameStats[currentBatter.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, doubles: 0, triples: 0 }

  const isHit = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'].includes(outcome)
  const isAB = !['WALK'].includes(outcome)

  gameStats[currentBatter.id] = {
    ...myStats,
    ab: isAB ? myStats.ab + 1 : myStats.ab,
    h: isHit ? myStats.h + 1 : myStats.h,
    hr: outcome === 'HR' ? myStats.hr + 1 : myStats.hr,
    rbi: myStats.rbi + basesResult.rbi,
    bb: outcome === 'WALK' ? myStats.bb + 1 : myStats.bb,
    k: outcome === 'STRIKEOUT' ? myStats.k + 1 : myStats.k,
    doubles: outcome === 'DOUBLE' ? myStats.doubles + 1 : myStats.doubles,
    triples: outcome === 'TRIPLE' ? myStats.triples + 1 : myStats.triples,
  }

  const newOuts = basesResult.outRecorded ? game.outs + 1 : game.outs
  const newHomeScore = game.homeScore + basesResult.runsScored
  const newLineupPosition = (game.lineupPosition + 1) % batters.length
  const gameLog = [...(game.gameLog as string[]), playDesc]

  let lastCpuLog: string[] | undefined

  // Check if user's half-inning is over
  if (newOuts >= 3) {
    // End of user's half (bottom). Advance to top of next inning.
    const newInning = game.inning + 1

    // Check game over BEFORE running CPU top-of-inning
    // Game ends if we've played 9+ full innings and scores differ, or 12+ innings
    const isGameOver =
      (newInning > 9 && newHomeScore !== game.awayScore) ||
      newInning > 12

    if (isGameOver) {
      const result =
        newHomeScore > game.awayScore ? 'user_win'
        : game.awayScore > newHomeScore ? 'cpu_win'
        : 'tie'

      await prisma.game.update({
        where: { id: game.id },
        data: {
          outs: 3,
          homeScore: newHomeScore,
          lineupPosition: newLineupPosition,
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
    }

    // Run CPU top of new inning
    const cpuLineup = game.cpuLineup as CpuBatter[]
    const userPitcherRecord = await prisma.player.findUnique({
      where: { id: game.userPitcherId },
      include: { mlbPlayer: true },
    })
    const userPitcherRating = userPitcherRecord?.mlbPlayer.pitching ?? 5

    const cpuResult = runCpuHalfInning(
      cpuLineup,
      { pitching: userPitcherRating },
      game.cpuLineupPosition
    )

    const newAwayScore = game.awayScore + cpuResult.score
    const newCpuLog = cpuResult.log
    lastCpuLog = newCpuLog
    const combinedLog = [...gameLog, ...newCpuLog]

    // Check game over after CPU top-of-inning (home team wins if ahead)
    // Standard: if home team leads after CPU's top of 9th+, game ends (no bottom needed)
    const homeWinsAfterTop =
      newInning > 9 && newHomeScore > newAwayScore

    if (homeWinsAfterTop) {
      await prisma.game.update({
        where: { id: game.id },
        data: {
          inning: newInning,
          halfInning: 'completed',
          outs: 0,
          homeScore: newHomeScore,
          awayScore: newAwayScore,
          runnersOnBase: { first: null, second: null, third: null },
          lineupPosition: newLineupPosition,
          cpuLineupPosition: cpuResult.newLineupPosition,
          gameLog: combinedLog,
          gameStats,
          status: 'completed',
          result: 'user_win',
          completedAt: new Date(),
        },
      })
      await finalizeGame(game.id, userId)
      const state = await buildGameState(game.id, userId)
      return NextResponse.json({ ...state, lastCpuLog })
    }

    // Continue: bottom of new inning, user bats
    await prisma.game.update({
      where: { id: game.id },
      data: {
        inning: newInning,
        halfInning: 'bot',
        outs: 0,
        homeScore: newHomeScore,
        awayScore: newAwayScore,
        runnersOnBase: { first: null, second: null, third: null },
        lineupPosition: newLineupPosition,
        cpuLineupPosition: cpuResult.newLineupPosition,
        gameLog: combinedLog,
        gameStats,
      },
    })
  } else {
    // Half-inning continues — just update the game state
    await prisma.game.update({
      where: { id: game.id },
      data: {
        outs: newOuts,
        homeScore: newHomeScore,
        runnersOnBase: basesResult.newBases,
        lineupPosition: newLineupPosition,
        gameLog,
        gameStats,
      },
    })
  }

  const state = await buildGameState(game.id, userId)
  return NextResponse.json({ ...state, lastCpuLog })
}
```

- [ ] **Step 2: Create `src/lib/game-end.ts`**

```typescript
import { prisma } from '@/lib/db'

// Called when a game completes.
// Reads game.gameStats and increments PlayerSeason for each user player.
export async function finalizeGame(gameId: string, userId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return

  const gameStats = game.gameStats as Record<
    string,
    { ab: number; h: number; hr: number; rbi: number; bb: number; k: number; doubles: number; triples: number }
  >

  for (const [playerId, stats] of Object.entries(gameStats)) {
    const season = await prisma.playerSeason.findUnique({ where: { playerId } })
    if (!season) continue

    await prisma.playerSeason.update({
      where: { playerId },
      data: {
        games: { increment: 1 },
        atBats: { increment: stats.ab },
        hits: { increment: stats.h },
        doubles: { increment: stats.doubles ?? 0 },
        triples: { increment: stats.triples ?? 0 },
        homeRuns: { increment: stats.hr },
        rbi: { increment: stats.rbi },
        walks: { increment: stats.bb ?? 0 },
        strikeouts: { increment: stats.k ?? 0 },
      },
    })
  }

  // Update pitcher stats
  const userPitcher = await prisma.player.findUnique({
    where: { id: game.userPitcherId },
    include: { playerSeason: true },
  })
  if (userPitcher?.playerSeason) {
    // Approximate IP: (number of outs recorded by CPU) / 3
    // For now: 9 innings × 3 outs = 27 outs / 3 = 9 IP (simplified)
    await prisma.playerSeason.update({
      where: { playerId: userPitcher.id },
      data: {
        gamesStarted: { increment: 1 },
        inningsPitched: { increment: 9 },
        earnedRuns: { increment: game.awayScore },
      },
    })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/game/at-bat/ src/lib/game-end.ts
git commit -m "feat: add at-bat API route and game finalization logic"
```

---

### Task 10: Roster API Route

**Files:**
- Create: `src/app/api/roster/route.ts`

- [ ] **Step 1: Create `src/app/api/roster/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const team = await prisma.team.findUnique({
    where: { userId: session.user.id },
    include: { mlbTeam: true },
  })
  if (!team) return NextResponse.json({ error: 'No team' }, { status: 404 })

  const players = await prisma.player.findMany({
    where: { teamId: team.id },
    include: {
      mlbPlayer: true,
      playerSeason: true,
    },
    orderBy: [
      { mlbPlayer: { isPitcher: 'asc' } },
      { mlbPlayer: { lineupOrder: 'asc' } },
    ],
  })

  const batters = players
    .filter((p) => !p.mlbPlayer.isPitcher && p.mlbPlayer.lineupOrder !== null)
    .map((p) => ({
      id: p.id,
      name: p.mlbPlayer.name,
      position: p.mlbPlayer.position,
      number: p.mlbPlayer.number,
      season: p.playerSeason,
    }))

  const pitchers = players
    .filter((p) => p.mlbPlayer.isPitcher)
    .map((p) => ({
      id: p.id,
      name: p.mlbPlayer.name,
      position: p.mlbPlayer.position,
      number: p.mlbPlayer.number,
      season: p.playerSeason,
    }))

  return NextResponse.json({
    team: {
      name: team.mlbTeam.name,
      abbr: team.mlbTeam.abbr,
      franchiseName: (await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { franchiseName: true },
      }))!.franchiseName,
    },
    batters,
    pitchers,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/roster/
git commit -m "feat: add roster API route"
```

---

### Task 11: ASCII Display Components

**Files:**
- Create: `src/components/AsciiBoard.tsx`
- Create: `src/components/AsciiStats.tsx`

- [ ] **Step 1: Create `src/components/AsciiBoard.tsx`**

```tsx
'use client'

import type { GameState } from '@/app/api/game/types'

interface Props {
  state: GameState
  lastCpuLog?: string[]
  onAtBat: () => void
  loading: boolean
}

function outPips(outs: number) {
  return [0, 1, 2].map((i) => (i < outs ? '●' : '○')).join('  ')
}

function runnerSymbol(occupied: boolean) {
  return occupied ? '●' : '○'
}

export function AsciiBoard({ state, lastCpuLog, onAtBat, loading }: Props) {
  const { inning, halfInning, outs, homeScore, awayScore, runnersOnBase,
          currentBatter, gameLog, userTeam, cpuTeam, status, result } = state

  const inningStr = `INNING ${inning} ${halfInning === 'bot' ? '▼' : '▲'}`
  const awayAbbr = cpuTeam.abbr.padEnd(3)
  const homeAbbr = userTeam.abbr.padEnd(3)

  const b = currentBatter
  const shortName = b.name.split(' ').map((s, i) => i === 0 ? s[0] + '.' : s).join(' ')
  const avgStr = b.seasonStats.avg.padStart(4)

  const gameOverMsg = status === 'completed'
    ? result === 'user_win' ? '  ★ YOU WIN! ★'
    : result === 'cpu_win' ? '  COMPUTER WINS'
    : '  FINAL — TIE'
    : ''

  const board = [
    `╔══════════════════════════════════════════════════════╗`,
    `║  ${userTeam.franchiseName.toUpperCase().padEnd(20)}${inningStr.padStart(30)}  ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  SCORE:  ${awayAbbr} ${String(awayScore).padStart(2)}  |  ${homeAbbr} ${String(homeScore).padStart(2)}                          ║`,
    `║  OUTS:   [ ${outPips(outs)} ]                                ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║                        2B                            ║`,
    `║                    ${runnerSymbol(!!runnersOnBase.second)}                         ║`,
    `║             3B                1B                     ║`,
    `║          ${runnerSymbol(!!runnersOnBase.third)}                    ${runnerSymbol(!!runnersOnBase.first)}            ║`,
    `║                    ${runnerSymbol(false)}                         ║`,
    `║                   HOME                               ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  AT BAT:  ${shortName.padEnd(18)}(#${String(b.number).padStart(2)} · ${b.position.padEnd(2)})  ║`,
    `║  ${avgStr} AVG  ·  ${String(b.seasonStats.hr).padStart(2)} HR  ·  ${String(b.seasonStats.rbi).padStart(3)} RBI  (season)       ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  ${(gameLog[0] ?? '—').slice(0, 52).padEnd(52)}  ║`,
    `╚══════════════════════════════════════════════════════╝`,
  ].join('\n')

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre className="font-mono text-green-400 text-sm leading-tight whitespace-pre">
        {board}
      </pre>

      {lastCpuLog && lastCpuLog.length > 0 && (
        <pre className="font-mono text-yellow-400 text-xs mt-2 whitespace-pre">
          {`  ${cpuTeam.abbr} half-inning:\n`}
          {lastCpuLog.map((l) => `    ${l}`).join('\n')}
        </pre>
      )}

      {status === 'in_progress' ? (
        <button
          onClick={onAtBat}
          disabled={loading}
          className="mt-6 font-mono text-black bg-green-400 hover:bg-green-300 disabled:opacity-50 px-8 py-3 text-sm tracking-widest"
        >
          {loading ? '  PITCHING...  ' : '  TAKE PLATE APPEARANCE  '}
        </button>
      ) : (
        <pre className="font-mono text-yellow-300 text-lg mt-4">{gameOverMsg}</pre>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/AsciiStats.tsx`**

```tsx
interface BatterRow {
  number: number
  name: string
  position: string
  season: {
    games: number; atBats: number; hits: number
    homeRuns: number; rbi: number; walks: number; strikeouts: number
  } | null
}

interface PitcherRow {
  number: number
  name: string
  position: string
  season: {
    gamesStarted: number; inningsPitched: number; hitsAllowed: number
    walksAllowed: number; strikeoutsThrown: number; earnedRuns: number
  } | null
}

interface Props {
  teamName: string
  franchiseName: string
  batters: BatterRow[]
  pitchers: PitcherRow[]
}

function avg(hits: number, ab: number): string {
  if (ab === 0) return '.000'
  return (hits / ab).toFixed(3).replace('0.', '.')
}

function era(er: number, ip: number): string {
  if (ip === 0) return '0.00'
  return ((er * 9) / ip).toFixed(2)
}

export function AsciiStats({ teamName, franchiseName, batters, pitchers }: Props) {
  const header = [
    `╔═══════════════════════════════════════════════════════════════════╗`,
    `║  ${franchiseName.toUpperCase().padEnd(65)}║`,
    `║  ${teamName.padEnd(65)}║`,
    `╠═══════════════════════════════════════════════════════════════════╣`,
    `║  BATTING                                                          ║`,
    `║  #    NAME                POS   G    AB    H   HR  RBI   AVG     ║`,
    `║  ─────────────────────────────────────────────────────────────── ║`,
  ].join('\n')

  const batterRows = batters.map((b) => {
    const s = b.season
    const g   = String(s?.games ?? 0).padStart(3)
    const ab  = String(s?.atBats ?? 0).padStart(4)
    const h   = String(s?.hits ?? 0).padStart(4)
    const hr  = String(s?.homeRuns ?? 0).padStart(4)
    const rbi = String(s?.rbi ?? 0).padStart(4)
    const a   = avg(s?.hits ?? 0, s?.atBats ?? 0)
    const num = String(b.number).padStart(3)
    const name = b.name.slice(0, 18).padEnd(18)
    const pos = b.position.padEnd(3)
    return `║  ${num}  ${name}  ${pos}  ${g}  ${ab}  ${h}  ${hr}  ${rbi}  ${a}   ║`
  })

  const pitcherHeader = [
    `╠═══════════════════════════════════════════════════════════════════╣`,
    `║  PITCHING                                                         ║`,
    `║  #    NAME                POS   G    IP    H   BB    K   ERA     ║`,
    `║  ─────────────────────────────────────────────────────────────── ║`,
  ].join('\n')

  const pitcherRows = pitchers.map((p) => {
    const s = p.season
    const g   = String(s?.gamesStarted ?? 0).padStart(3)
    const ip  = String(s?.inningsPitched ?? 0).padStart(5)
    const h   = String(s?.hitsAllowed ?? 0).padStart(4)
    const bb  = String(s?.walksAllowed ?? 0).padStart(4)
    const k   = String(s?.strikeoutsThrown ?? 0).padStart(4)
    const e   = era(s?.earnedRuns ?? 0, s?.inningsPitched ?? 0)
    const num = String(p.number).padStart(3)
    const name = p.name.slice(0, 18).padEnd(18)
    const pos = p.position.padEnd(3)
    return `║  ${num}  ${name}  ${pos}  ${g}  ${ip}  ${h}  ${bb}  ${k}  ${e}  ║`
  })

  const footer = `╚═══════════════════════════════════════════════════════════════════╝`

  const board = [header, ...batterRows, pitcherHeader, ...pitcherRows, footer].join('\n')

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-start p-4 pt-8">
      <pre className="font-mono text-green-400 text-sm leading-tight whitespace-pre overflow-x-auto">
        {board}
      </pre>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/
git commit -m "feat: add ASCII game board and stats table components"
```

---

### Task 12: Pages and Layout

**Files:**
- Replace: `src/app/layout.tsx`
- Create: `src/app/providers.tsx`
- Replace: `src/app/page.tsx`
- Create: `src/app/signup/page.tsx`
- Create: `src/app/game/page.tsx`
- Create: `src/app/stats/page.tsx`

- [ ] **Step 1: Create `src/app/providers.tsx`**

```tsx
'use client'

import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

- [ ] **Step 2: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const mono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Baseball Game',
  description: 'Turn-by-turn baseball dice game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${mono.className} bg-black text-green-400`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Replace `src/app/page.tsx` (Login page)**

```tsx
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/game')
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre className="font-mono text-green-400 text-2xl mb-8">
        {`⚾  BASEBALL DICE GAME  ⚾`}
      </pre>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xs">
        <input
          type="email"
          placeholder="EMAIL"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none focus:border-green-300"
        />
        <input
          type="password"
          placeholder="PASSWORD"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none focus:border-green-300"
        />
        {error && <p className="font-mono text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="border border-green-400 text-green-400 font-mono p-2 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {loading ? 'LOGGING IN...' : 'LOGIN'}
        </button>
        <Link href="/signup" className="font-mono text-xs text-center text-green-600 hover:text-green-400">
          NEW FRANCHISE? SIGN UP →
        </Link>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/signup/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [franchiseName, setFranchiseName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, franchiseName }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Registration failed')
      setLoading(false)
      return
    }

    // Auto sign-in after registration
    const signInRes = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)
    if (signInRes?.error) {
      setError('Account created but login failed. Please log in.')
      router.push('/')
    } else {
      router.push('/game')
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre className="font-mono text-green-400 text-2xl mb-2">{`⚾  NEW FRANCHISE  ⚾`}</pre>
      <pre className="font-mono text-green-600 text-xs mb-8">{'A random MLB roster will be drafted for you'}</pre>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xs">
        <input
          type="text"
          placeholder="FRANCHISE NAME (e.g. THE CRUSHERS)"
          value={franchiseName}
          onChange={(e) => setFranchiseName(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none"
        />
        <input
          type="email"
          placeholder="EMAIL"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none"
        />
        <input
          type="password"
          placeholder="PASSWORD"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none"
        />
        {error && <p className="font-mono text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="border border-green-400 text-green-400 font-mono p-2 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {loading ? 'DRAFTING YOUR TEAM...' : 'CREATE FRANCHISE + DRAFT TEAM'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/app/game/page.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AsciiBoard } from '@/components/AsciiBoard'
import type { GameState } from '@/app/api/game/types'

export default function GamePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [lastCpuLog, setLastCpuLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') loadCurrentGame()
  }, [status])

  async function loadCurrentGame() {
    const res = await fetch('/api/game/current')
    const data = await res.json()
    if (data?.id) setGameState(data)
  }

  async function startGame() {
    setStarting(true)
    setError('')
    const res = await fetch('/api/game/start', { method: 'POST' })
    const data = await res.json()
    setStarting(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to start game')
      return
    }
    setLastCpuLog(data.lastCpuLog ?? [])
    setGameState(data)
  }

  async function handleAtBat() {
    if (!gameState) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/game/at-bat', { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Error processing at-bat')
      return
    }
    setLastCpuLog(data.lastCpuLog ?? [])
    setGameState(data)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <pre className="font-mono text-green-400">LOADING...</pre>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <pre className="font-mono text-green-400 text-xl">{`⚾  BASEBALL DICE GAME  ⚾`}</pre>
        {error && <pre className="font-mono text-red-400 text-sm">{error}</pre>}
        <button
          onClick={startGame}
          disabled={starting}
          className="border border-green-400 text-green-400 font-mono px-8 py-3 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {starting ? '  STARTING GAME...  ' : '  NEW GAME  '}
        </button>
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          VIEW ROSTER + STATS →
        </button>
      </div>
    )
  }

  return (
    <div>
      <AsciiBoard
        state={gameState}
        lastCpuLog={lastCpuLog}
        onAtBat={handleAtBat}
        loading={loading}
      />
      {error && (
        <pre className="font-mono text-red-400 text-xs text-center">{error}</pre>
      )}
      <div className="flex justify-center gap-6 pb-4">
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          ROSTER / STATS
        </button>
        {gameState.status === 'completed' && (
          <button
            onClick={() => { setGameState(null); setLastCpuLog([]) }}
            className="font-mono text-xs text-green-600 hover:text-green-400"
          >
            NEW GAME
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `src/app/stats/page.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AsciiStats } from '@/components/AsciiStats'

export default function StatsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [roster, setRoster] = useState<any>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/roster').then((r) => r.json()).then(setRoster)
    }
  }, [status])

  if (!roster) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <pre className="font-mono text-green-400">LOADING ROSTER...</pre>
      </div>
    )
  }

  return (
    <div>
      <AsciiStats
        teamName={roster.team.name}
        franchiseName={roster.team.franchiseName}
        batters={roster.batters}
        pitchers={roster.pitchers}
      />
      <div className="flex justify-center pb-4">
        <button
          onClick={() => router.push('/game')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          ← BACK TO GAME
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/
git commit -m "feat: add all pages (login, signup, game, stats) and layout"
```

---

### Task 13: Smoke Test End-to-End

- [ ] **Step 1: Start all services**

```bash
docker compose up -d
npm run dev
```
Expected: Next.js dev server running at http://localhost:3000, no compile errors.

- [ ] **Step 2: Verify signup flow**

1. Open http://localhost:3000
2. Click "NEW FRANCHISE? SIGN UP →"
3. Enter: franchise name "THE CRUSHERS", a test email, password
4. Submit — should redirect to `/game`
5. Expected: a "NEW GAME" button appears (no active game yet)

- [ ] **Step 3: Start a game and verify the board renders**

1. Click "NEW GAME"
2. Expected: the ASCII board appears with an inning header, score, diamond, and "TAKE PLATE APPEARANCE" button
3. The CPU top-of-inning log should appear below the board (yellow text)

- [ ] **Step 4: Play through at least one complete inning**

1. Click "TAKE PLATE APPEARANCE" 3+ times until 3 outs
2. Expected: outs indicator increments, runners appear on bases after hits, score updates on runs
3. After 3rd out: CPU's half-inning log appears, new inning begins

- [ ] **Step 5: Verify stats are updated after a completed game**

1. Play a full 9-inning game (or manually update a game to `status='completed'` in Prisma Studio)
2. Visit http://localhost:3000/stats
3. Expected: batting stats table shows non-zero G, AB, H, AVG

- [ ] **Step 6: Verify game resume**

1. Start a new game, take a few at-bats
2. Navigate away, then return to http://localhost:3000/game
3. Expected: the game resumes at the same inning/outs/score

- [ ] **Step 7: Run all unit tests one final time**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: verify smoke tests pass, all features complete"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Sign up with franchise name → random MLB team drafted
- ✅ Play vs computer (CPU half-inning auto-runs)
- ✅ One button per plate appearance
- ✅ Player stats tracked (PlayerSeason), updated on game completion
- ✅ ASCII display with diamond, score, outs, current batter
- ✅ Game resume (`status=in_progress` check)
- ✅ Auth (NextAuth credentials, protected routes)
- ✅ PostgreSQL with Prisma
- ✅ Game state as JSON blob, no AtBat table
- ✅ Multiplayer-ready: session-based auth, Game model extendable

**Known simplifications in v1:**
- Pitcher always goes 9 IP (no fatigue, no bullpen)
- No tag-up on flyouts
- No double plays on groundouts
- Stats page does not expand per-game lines (clicking a player does not yet load `Game.gameStats` drill-down — add in a future task)
