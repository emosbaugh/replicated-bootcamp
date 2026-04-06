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
