export interface Player {
  id: string
  name: string
  primary_position: string
  secondary_position?: string | null
  email?: string | null
  phone?: string | null
  teamId?: string | null
}

export interface Training {
  id: string
  date: string
  status: string
  teamId?: string | null
}

export interface Plateau {
  id: string
  date: string
  lieu: string
  address?: string | null
  startTime?: string | null
  meetingTime?: string | null
  teamId?: string | null
}

export interface ClubMe {
  id: string
  name: string
  createdAt?: string
}

export interface Team {
  id: string
  name: string
  category?: string | null
  clubId?: string | null
  createdAt?: string
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED'

export interface AccountInvitation {
  id: string
  email: string
  role: 'DIRECTION' | 'COACH' | 'PLAYER' | 'PARENT'
  status: InvitationStatus
  inviteUrl?: string
  sentAt?: string
  createdAt?: string
  expiresAt?: string
  acceptedAt?: string | null
}

export interface InvitationDetails {
  id: string
  email: string
  role: 'DIRECTION' | 'COACH' | 'PLAYER' | 'PARENT'
  status: InvitationStatus
  expiresAt?: string
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
  teamId?: string | null
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

export interface AiGeneratedTrainingDrillItem {
  drill: Drill
  trainingDrill: TrainingDrill
  diagram?: {
    id: string
    drillId: string
    title?: string
    data?: unknown
  } | null
}

export interface GenerateTrainingDrillsResponse {
  objective: string
  ageBand?: string | null
  count: number
  items: AiGeneratedTrainingDrillItem[]
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
  played?: boolean
  teams: MatchTeamLite[]
  scorers: MatchScorer[]
  opponentName?: string | null
}
