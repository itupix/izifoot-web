import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet } from './apiClient'
import { apiRoutes } from './apiRoutes'
import { useAuth } from './useAuth'
import type { Team } from './types/api'

type TeamOption = {
  id: string
  name: string
}

type TeamScopeState = {
  selectedTeamId: string | null
  setSelectedTeamId: (teamId: string | null) => void
  teamOptions: TeamOption[]
  loading: boolean
  requiresSelection: boolean
  canSelectTeam: boolean
  refreshTeamScope: () => Promise<void>
}

const TeamScopeCtx = createContext<TeamScopeState | null>(null)

function storageKey(userId: string): string {
  return `izifoot.selectedTeam.${userId}`
}

const ACTIVE_TEAM_STORAGE_KEY = 'izifoot.activeTeamId'

function readString(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function toTeamOption(team: Team): TeamOption | null {
  const raw = (team && typeof team === 'object' ? team : {}) as Record<string, unknown>
  const id = readString(raw, 'id', 'teamId', 'team_id')
  if (!id) return null
  const name = readString(raw, 'name', 'teamName', 'team_name', 'label')
  return { id, name: name || id }
}

export function TeamScopeProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth()
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshTeamScope = useCallback(async () => {
    if (!me) {
      setTeamOptions([])
      setSelectedTeamIdState(null)
      return
    }

    if (me.role === 'PLAYER' || me.role === 'PARENT') {
      const singleTeam = me.teamId ? [{ id: me.teamId, name: me.teamId }] : []
      setTeamOptions(singleTeam)
      setSelectedTeamIdState(me.teamId)
      return
    }

    setLoading(true)
    try {
      const fetchedTeams = await apiGet<Team[]>(apiRoutes.teams.list).catch(() => [])
      const normalized = (Array.isArray(fetchedTeams) ? fetchedTeams : [])
        .map(toTeamOption)
        .filter((team): team is TeamOption => Boolean(team))

      const coachManagedSet = me.role === 'COACH' && me.managedTeamIds.length > 0 ? new Set(me.managedTeamIds) : null
      const scopedTeams = coachManagedSet ? normalized.filter((team) => coachManagedSet.has(team.id)) : normalized
      const fallbackFromManaged =
        coachManagedSet && scopedTeams.length === 0
          ? me.managedTeamIds.map((id) => ({ id, name: id }))
          : []
      const finalOptions = scopedTeams.length > 0 ? scopedTeams : fallbackFromManaged

      setTeamOptions(finalOptions)

      const saved = window.localStorage.getItem(storageKey(me.id))
      const isSavedValid = saved ? finalOptions.some((team) => team.id === saved) : false
      const nextTeamId = isSavedValid
        ? saved
        : finalOptions.some((team) => team.id === selectedTeamId)
          ? selectedTeamId
          : finalOptions[0]?.id ?? null

      setSelectedTeamIdState(nextTeamId)
    } finally {
      setLoading(false)
    }
  }, [me, selectedTeamId])

  useEffect(() => {
    void refreshTeamScope()
  }, [refreshTeamScope])

  useEffect(() => {
    if (!me) {
      window.localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
      return
    }
    if (selectedTeamId) {
      window.localStorage.setItem(storageKey(me.id), selectedTeamId)
      window.localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, selectedTeamId)
    } else {
      window.localStorage.removeItem(storageKey(me.id))
      window.localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
    }
  }, [me, selectedTeamId])

  const canSelectTeam = (me?.role === 'DIRECTION' || me?.role === 'COACH') && teamOptions.length > 0
  const requiresSelection = (me?.role === 'DIRECTION' || me?.role === 'COACH') && teamOptions.length > 0

  const value = useMemo<TeamScopeState>(
    () => ({
      selectedTeamId,
      setSelectedTeamId: setSelectedTeamIdState,
      teamOptions,
      loading,
      requiresSelection,
      canSelectTeam,
      refreshTeamScope,
    }),
    [selectedTeamId, teamOptions, loading, requiresSelection, canSelectTeam, refreshTeamScope],
  )

  return <TeamScopeCtx.Provider value={value}>{children}</TeamScopeCtx.Provider>
}

export function useTeamScope() {
  const ctx = useContext(TeamScopeCtx)
  if (!ctx) throw new Error('TeamScopeProvider missing')
  return ctx
}
