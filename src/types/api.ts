export interface Player {
  id: string
  name: string
  primary_position: string
  secondary_position?: string | null
  email?: string | null
  phone?: string | null
}

export interface Training {
  id: string
  date: string
  status: string
}

export interface Plateau {
  id: string
  date: string
  lieu: string
}

export interface AttendanceRow {
  id?: string
  session_type: 'TRAINING' | 'PLATEAU'
  session_id: string
  playerId: string
}

export interface Drill {
  id: string
  title: string
  category: string
  duration: number
  players: string
  description: string
  tags: string[]
}

export interface DrillsResponse {
  items: Drill[]
  categories: string[]
  tags: string[]
}

export interface TrainingDrill {
  id: string
  trainingId: string
  drillId: string
  order: number
  duration?: number | null
  notes?: string | null
  meta?: Drill | null
}

export interface MatchTeamPlayer {
  playerId?: string
  role?: 'starter' | 'sub'
  player: Player
}

export interface MatchTeamLite {
  id: string
  side: 'home' | 'away'
  score: number
  players?: MatchTeamPlayer[]
}

export interface MatchScorer {
  id?: string
  playerId: string
  side: 'home' | 'away'
  playerName?: string
}

export interface MatchLite {
  id: string
  createdAt: string
  type: 'ENTRAINEMENT' | 'PLATEAU'
  plateauId?: string | null
  teams: MatchTeamLite[]
  scorers: MatchScorer[]
  opponentName?: string | null
}
