export interface PaginationMeta {
  limit: number
  offset: number
  returned: number
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationMeta
}

export interface Player {
  id: string
  name: string
  firstName?: string | null
  first_name?: string | null
  prenom?: string | null
  lastName?: string | null
  last_name?: string | null
  nom?: string | null
  primary_position: string
  secondary_position?: string | null
  email?: string | null
  phone?: string | null
  licence?: string | null
  license?: string | null
  isChild?: boolean | null
  enfant?: boolean | null
  parentFirstName?: string | null
  parent_first_name?: string | null
  parentPrenom?: string | null
  parentLastName?: string | null
  parent_last_name?: string | null
  parentNom?: string | null
  teamId?: string | null
}

export interface Training {
  id: string
  date: string
  status: string
  teamId?: string | null
}

export interface Matchday {
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
  format?: string | null
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
  present: boolean
}

export interface Drill {
  id: string
  title: string
  category: string
  duration: number
  players: string
  description: string
  descriptionHtml?: string | null
  tags: string[]
  teamId?: string | null
}

export interface DrillsResponse {
  items: Drill[]
  categories: string[]
  tags: string[]
  pagination?: PaginationMeta
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

export interface TrainingRoleAssignment {
  id: string
  trainingId: string
  role: string
  playerId: string
  player?: {
    id: string
    name: string
  }
}

export interface TrainingRolesResponse {
  items: TrainingRoleAssignment[]
}

export interface AiGeneratedTrainingDrillItem {
  drill: Drill
  trainingDrill: TrainingDrill
  diagram?: {
    id: string
    drillId: string
    title?: string
    data?: unknown
    trainingDrillId?: string
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
  player?: Player
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
  matchdayId?: string | null
  rotationGameKey?: string | null
  status?: 'PLANNED' | 'PLAYED' | 'CANCELLED' | string
  played?: boolean
  teams: MatchTeamLite[]
  scorers: MatchScorer[]
  opponentName?: string | null
}
