import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

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
      { name: "Travis d'Arnaud",    pos: 'C',   num: 16, contact: 7, power:  6, speed: 3,  lo: 6 },
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
      { name: "Tyler O'Neill",      pos: 'LF',  num: 10, contact: 7, power:  8, speed: 6,  lo: 5 },
      { name: 'Connor Wong',        pos: 'C',   num: 12, contact: 6, power:  6, speed: 5,  lo: 6 },
      { name: 'Rob Refsnyder',      pos: 'RF',  num: 30, contact: 7, power:  5, speed: 6,  lo: 7 },
      { name: 'Ceddanne Rafaela',   pos: 'DH',  num: 43, contact: 6, power:  5, speed: 8,  lo: 8 },
      { name: 'David Hamilton',     pos: 'SS',  num: 70, contact: 6, power:  4, speed: 9,  lo: 9 },
    ],
    pitcher: { name: 'Brayan Bello', num: 66, pitching: 7 },
  },
]

const BENCH_TEMPLATES = [
  { suffix: 'B1',  pos: 'C',   contact: 5, power: 4, speed: 4, isPitcher: false },
  { suffix: 'B2',  pos: 'IF',  contact: 5, power: 5, speed: 5, isPitcher: false },
  { suffix: 'B3',  pos: 'OF',  contact: 5, power: 4, speed: 6, isPitcher: false },
  { suffix: 'B4',  pos: 'IF',  contact: 6, power: 4, speed: 5, isPitcher: false },
  { suffix: 'B5',  pos: 'OF',  contact: 5, power: 5, speed: 6, isPitcher: false },
  { suffix: 'SP',  pos: 'SP',  contact: 1, power: 1, speed: 1, pitching: 7, isPitcher: true },
  { suffix: 'SP2', pos: 'SP',  contact: 1, power: 1, speed: 1, pitching: 6, isPitcher: true },
  { suffix: 'RP1', pos: 'RP',  contact: 1, power: 1, speed: 1, pitching: 7, isPitcher: true },
  { suffix: 'RP2', pos: 'RP',  contact: 1, power: 1, speed: 1, pitching: 6, isPitcher: true },
  { suffix: 'RP3', pos: 'RP',  contact: 1, power: 1, speed: 1, pitching: 6, isPitcher: true },
  { suffix: 'CL',  pos: 'CL',  contact: 1, power: 1, speed: 1, pitching: 8, isPitcher: true },
  { suffix: 'B6',  pos: 'OF',  contact: 5, power: 4, speed: 5, isPitcher: false },
  { suffix: 'B7',  pos: 'IF',  contact: 5, power: 5, speed: 4, isPitcher: false },
  { suffix: 'B8',  pos: '1B',  contact: 5, power: 6, speed: 4, isPitcher: false },
  { suffix: 'B9',  pos: 'C',   contact: 5, power: 4, speed: 4, isPitcher: false },
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
