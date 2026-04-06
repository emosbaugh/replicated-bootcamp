# Baseball Game Web App — Design Spec

**Date:** 2026-04-06
**Status:** Approved

---

## Overview

A web-based baseball game inspired by tabletop baseball dice games. Users sign up, are drafted a real MLB team, and play turn-by-turn against a computer opponent. Each plate appearance is resolved with one button click. The app tracks full player stats across games.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js (credentials provider) |
| Styling | Tailwind CSS + monospace ASCII components |
| Deploy — App | Vercel |
| Deploy — DB | Railway or Supabase (managed Postgres) |

---

## Architecture

```
Next.js App (TypeScript)
├── /app
│   ├── /                 — Landing / login
│   ├── /signup           — Register + team draft
│   ├── /game             — Main game screen
│   └── /stats            — Player stats / roster
├── /app/api
│   ├── /auth             — NextAuth endpoints
│   ├── /game             — Game state (start, at-bat, result)
│   └── /roster           — Team/player data
├── /lib
│   ├── db.ts             — Prisma client
│   ├── game-engine.ts    — Dice/outcome logic
│   └── roster-seeder.ts  — Seed real MLB rosters
└── /prisma
    └── schema.prisma     — DB schema
```

---

## Data Models

### User
- `id`, `email`, `passwordHash`, `teamName`
- Has one `Team`, many `Game`s

### Team
- `id`, `userId`, `mlbTeamName` (e.g. "New York Yankees")
- Has 25 `Player` slots (cloned from seeded roster on signup)

### Player
- `id`, `teamId`, `name`, `position`, `number`
- Ratings (1–10): `contact`, `power`, `speed`
- Derived from real MLB player stats at seed time
- **Roster data source:** Hand-curated seed file based on current rosters, or imported from a public dataset (e.g. [chadwickbureau/baseballdatabank](https://github.com/chadwickbureau/baseballdatabank)). Ratings computed from recent season stats (BA → contact, SLG → power, SB → speed).

### Game
- `id`, `userId`
- `inning` (int), `halfInning` (top | bot), `outs` (0–3), `homeScore`, `awayScore`
- `runnersOnBase` (JSON: `{ first, second, third }` → playerId | null)
- `lineupPosition` (int, which batter is up)
- `gameLog` (JSON array of play-by-play strings, e.g. `"Judge — Solo HR (3)"`)
- `gameStats` (JSON: per-player stat lines for this game)
- `status` (in_progress | completed)
- `completedAt` (nullable)

**No `AtBat` table.** Game state and play-by-play live as JSON blobs on `Game`. This bounds storage to one row per game.

### PlayerSeason
- `id`, `playerId`, `userId`
- Batting: `games`, `atBats`, `hits`, `doubles`, `triples`, `homeRuns`, `rbi`, `walks`, `strikeouts`
- Pitching: `gamesStarted`, `inningsPitched`, `hitsAllowed`, `walksAllowed`, `strikeoutsThrown`, `earnedRuns`
- Updated in-place after each completed game.

---

## Game Engine (`/lib/game-engine.ts`)

Each plate appearance:

1. Look up the batter's `contact`, `power`, and `speed` ratings
2. Simulate a dice roll (2d6 equivalent via seeded `Math.random()`)
3. Map roll + ratings to an outcome using a hybrid table:
   - Low roll + low contact → strikeout or weak groundout
   - Mid roll → single, walk, groundout, flyout (contact-weighted)
   - High roll + high power → double, triple, or home run
4. Resolve baserunning — advance runners based on outcome and speed ratings
5. Score runs, update outs
6. Append result to `Game.gameLog`, update `Game.gameStats`
7. Persist updated `Game` to DB
8. Return new game state + result string to frontend

`PlayerSeason` is updated **only when a game completes** (not per at-bat), using the final `Game.gameStats` JSON as the source. This prevents double-counting if a game is abandoned mid-play.

The computer team uses the same engine — its half-inning auto-resolves server-side and returns a summary to the frontend.

---

## User Flow

```
/               — Landing page with login form
/signup         — Register: email, password, team name
                  → team draft runs server-side
                  → redirect to /game
/game           — Protected; redirects to / if unauthenticated
/stats          — Protected; full roster + season stats
```

### Team Draft (on signup)
- 25 players pulled from seeded DB, position-balanced:
  - C, 1B, 2B, 3B, SS, LF, CF, RF (8 position players)
  - 5 starting pitchers, 3 relievers, 1 closer
  - 7 bench/utility slots
- Players cloned into the user's roster so stats are tracked independently per user

### Game Resume
- Any `Game` with `status = in_progress` can be resumed from `/game`
- Full state (inning, score, outs, runners, lineup position, game log) restored from DB

---

## Game Screen (ASCII UI)

```
╔══════════════════════════════════════════════════════╗
║          YANKEES vs. DODGERS  —  INNING 4 ▼          ║
╠══════════════════════════════════════════════════════╣
║  SCORE:  NYY 3  |  LAD 2                             ║
║  OUTS:   [ ● ]  [ ○ ]  [ ○ ]                        ║
╠══════════════════════════════════════════════════════╣
║                     2B                               ║
║                      ●                               ║
║               3B          1B                         ║
║                ○            ●                        ║
║                      ○                               ║
║                    HOME                              ║
╠══════════════════════════════════════════════════════╣
║  AT BAT:  J. Rodriguez  (#7 · RF)                    ║
║  .301 AVG  ·  8 HR  ·  31 RBI  (season)             ║
╠══════════════════════════════════════════════════════╣
║  LAST:  Judge — Solo HR (3)  ·  NYY scores!          ║
╚══════════════════════════════════════════════════════╝

         [  TAKE PLATE APPEARANCE  ]
```

- One button click → POST `/api/game/at-bat` → outcome resolves → state updates
- Between half-innings: "Computer batting..." interstitial → CPU half-inning auto-resolves → summary displayed

---

## Stats Page (ASCII UI)

```
╔══════════════════════════════════════════════════════════════════╗
║                    YOUR ROSTER — NEW YORK YANKEES                ║
╠══════════════════════════════════════════════════════════════════╣
║  BATTING                                                         ║
║  #   NAME              POS   G    AB    H    HR   RBI   AVG     ║
║  ──────────────────────────────────────────────────────────────  ║
║   7   J. Rodriguez      RF   12    44   13    3    11   .295    ║
║  99   A. Judge           CF   12    46   12    5    14   .261    ║
║  ...                                                             ║
╠══════════════════════════════════════════════════════════════════╣
║  PITCHING                                                        ║
║  #   NAME              POS   G    IP    H    BB    K    ERA     ║
║  ──────────────────────────────────────────────────────────────  ║
║  21   G. Cole            SP   12   72    58   18   89   2.81    ║
║  ...                                                             ║
╚══════════════════════════════════════════════════════════════════╝
```

- Stats pulled from `PlayerSeason`, updated after each completed game
- Clicking a player expands to game-by-game stat lines (from `Game.gameStats` JSON)

---

## Multiplayer Readiness

Not built in v1, but the architecture supports it:
- Auth is session/cookie-based — two users on separate devices work independently today
- `Game` model can be extended with a `guestUserId` for head-to-head play
- Turn-based multiplayer (each user clicks their at-bat) requires only a `currentTurnUserId` field + polling or SSE
- Real-time (WebSockets) is addable via Next.js route handlers

---

## Testing

- Unit tests for `game-engine.ts` — seed RNG, assert outcome distribution is correct
- Integration tests for API routes — game state transitions (start, at-bat, inning change, game over)
- No UI tests in v1

---

## Local Development

```bash
docker-compose up          # Postgres
npm run dev                # Next.js dev server
npx prisma migrate dev     # Run DB migrations
npx prisma db seed         # Seed MLB rosters
```

**Required env vars:**
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
