import type { ClubCoach } from '../types/api'

function readString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readStringList(raw: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = raw[key]
    if (!Array.isArray(value)) continue
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }
  return []
}

function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function normalizeClubCoach(input: unknown): ClubCoach | null {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const id = readString(raw, 'id')
  if (!id) return null

  const firstName = readString(raw, 'firstName', 'first_name', 'prenom')
  const lastName = readString(raw, 'lastName', 'last_name', 'nom')
  const fallbackName = readString(raw, 'name')
  const splitName = !firstName && !lastName && fallbackName ? splitFullName(fallbackName) : null
  const managedTeamIds = readStringList(raw, 'managedTeamIds', 'managed_team_ids')
  const managedTeamsRaw = Array.isArray(raw.managedTeams) ? raw.managedTeams : []
  const managedTeams = managedTeamsRaw
    .map((item) => {
      const itemRaw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const teamId = readString(itemRaw, 'id', 'teamId', 'team_id')
      if (!teamId) return null
      return {
        id: teamId,
        name: readString(itemRaw, 'name', 'teamName', 'team_name') ?? teamId,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return {
    id,
    firstName: firstName ?? splitName?.firstName ?? null,
    lastName: lastName ?? splitName?.lastName ?? null,
    email: readString(raw, 'email') ?? '',
    phone: readString(raw, 'phone', 'telephone'),
    teamId: readString(raw, 'teamId', 'team_id'),
    teamName: readString(raw, 'teamName', 'team_name'),
    managedTeamIds,
    managedTeams,
    invitationStatus: readString(raw, 'invitationStatus', 'status') ?? undefined,
    role: 'COACH',
    createdAt: readString(raw, 'createdAt'),
    updatedAt: readString(raw, 'updatedAt'),
    invitedByUserId: readString(raw, 'invitedByUserId'),
    acceptedAt: readString(raw, 'acceptedAt'),
    expiresAt: readString(raw, 'expiresAt'),
  }
}

export function coachDisplayName(coach: Pick<ClubCoach, 'firstName' | 'lastName' | 'email'>): string {
  const fullName = `${coach.firstName || ''} ${coach.lastName || ''}`.trim()
  return fullName || coach.email || 'Coach'
}

export function coachInvitationBadge(coach: Pick<ClubCoach, 'invitationStatus'>): string | null {
  const status = (coach.invitationStatus || '').toUpperCase()
  if (status === 'PENDING') return 'Invitation en attente'
  if (status === 'ACCEPTED') return null
  if (status === 'EXPIRED') return 'Invitation expirée'
  if (status === 'CANCELLED') return 'Invitation annulée'
  return status || null
}

export function isCoachAssignedToTeam(coach: Pick<ClubCoach, 'managedTeamIds'>, teamId: string): boolean {
  return (coach.managedTeamIds || []).includes(teamId)
}

export function coachManagedTeamsLabel(coach: Pick<ClubCoach, 'managedTeams'>): string {
  const names = (coach.managedTeams || []).map((team) => team.name).filter(Boolean)
  return names.length ? names.join(', ') : 'Non affecté'
}

export function compareCoaches(lhs: ClubCoach, rhs: ClubCoach): number {
  return `${lhs.lastName || ''} ${lhs.firstName || ''} ${lhs.email || ''}`
    .localeCompare(`${rhs.lastName || ''} ${rhs.firstName || ''} ${rhs.email || ''}`, 'fr-FR')
}
