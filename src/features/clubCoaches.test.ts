import { describe, expect, it } from 'vitest'
import {
  coachDisplayName,
  coachInvitationBadge,
  coachManagedTeamsLabel,
  compareCoaches,
  isCoachAssignedToTeam,
  normalizeClubCoach,
} from './clubCoaches'

describe('normalizeClubCoach', () => {
  it('normalizes managed teams and invitation status', () => {
    expect(normalizeClubCoach({
      id: 'coach-1',
      firstName: 'Lina',
      lastName: 'Dupont',
      email: 'lina@example.com',
      managedTeamIds: ['team-1', 'team-2'],
      managedTeams: [{ id: 'team-1', name: 'U11 A' }, { id: 'team-2', name: 'U13' }],
      invitationStatus: 'PENDING',
    })).toEqual({
      id: 'coach-1',
      firstName: 'Lina',
      lastName: 'Dupont',
      email: 'lina@example.com',
      phone: null,
      teamId: null,
      teamName: null,
      managedTeamIds: ['team-1', 'team-2'],
      managedTeams: [{ id: 'team-1', name: 'U11 A' }, { id: 'team-2', name: 'U13' }],
      invitationStatus: 'PENDING',
      role: 'COACH',
      createdAt: null,
      updatedAt: null,
      invitedByUserId: null,
      acceptedAt: null,
      expiresAt: null,
    })
  })

  it('falls back to split full name when first and last names are missing', () => {
    expect(normalizeClubCoach({
      id: 'coach-2',
      name: 'Alex Martin',
      email: 'alex@example.com',
    })).toMatchObject({
      firstName: 'Alex',
      lastName: 'Martin',
    })
  })
})

describe('coach helpers', () => {
  const coach = normalizeClubCoach({
    id: 'coach-1',
    firstName: 'Lina',
    lastName: 'Dupont',
    email: 'lina@example.com',
    managedTeamIds: ['team-1'],
    managedTeams: [{ id: 'team-1', name: 'U11 A' }],
  })!

  it('builds readable labels', () => {
    expect(coachDisplayName(coach)).toBe('Lina Dupont')
    expect(coachManagedTeamsLabel(coach)).toBe('U11 A')
    expect(coachInvitationBadge({ invitationStatus: 'PENDING' })).toBe('Invitation en attente')
  })

  it('checks assignment membership and sorting', () => {
    expect(isCoachAssignedToTeam(coach, 'team-1')).toBe(true)
    expect(isCoachAssignedToTeam(coach, 'team-2')).toBe(false)
    expect(compareCoaches(
      normalizeClubCoach({ id: '2', firstName: 'Zoé', lastName: 'Alpha', email: 'zoe@example.com' })!,
      normalizeClubCoach({ id: '3', firstName: 'Anne', lastName: 'Bravo', email: 'anne@example.com' })!,
    )).toBeLessThan(0)
  })
})
