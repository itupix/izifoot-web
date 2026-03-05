export const ACCOUNT_ROLES = ['DIRECTION', 'COACH', 'PLAYER', 'PARENT'] as const

export type AccountRole = (typeof ACCOUNT_ROLES)[number]

export interface AuthProfile {
  role: AccountRole
  clubId: string | null
  teamId: string | null
  managedTeamIds: string[]
  linkedPlayerUserId: string | null
}

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && ACCOUNT_ROLES.includes(value as AccountRole)
}

export function normalizeRole(value: unknown): AccountRole {
  if (isAccountRole(value)) return value
  return 'DIRECTION'
}

export function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function normalizeManagedTeamIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function isReadOnlyRole(role: AccountRole): boolean {
  return role === 'PLAYER' || role === 'PARENT'
}

export function isStaffRole(role: AccountRole): boolean {
  return role === 'DIRECTION' || role === 'COACH'
}

export function canManageClub(role: AccountRole): boolean {
  return role === 'DIRECTION'
}

export function canWrite(role: AccountRole): boolean {
  return !isReadOnlyRole(role)
}

export function getDefaultRouteByRole(role: AccountRole): string {
  return role === 'DIRECTION' ? '/club' : '/planning'
}
