import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
}

const TeamScopeCtx = createContext<TeamScopeState | null>(null)

function storageKey(userId: string): string {
  return `izifoot.selectedTeam.${userId}`
}

function toTeamOption(team: Team): TeamOption | null {
  if (!team?.id) return null
  return { id: team.id, name: team.name || team.id }
}

export function TeamScopeProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth()
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let isCancelled = false

    async function load() {
      if (!me) {
        setTeamOptions([])
        setSelectedTeamIdState(null)
        return
      }

      if (me.role === 'PLAYER' || me.role === 'PARENT') {
        const singleTeam = me.teamId ? [{ id: me.teamId, name: me.teamId }] : []
        if (!isCancelled) {
          setTeamOptions(singleTeam)
          setSelectedTeamIdState(me.teamId)
        }
        return
      }

      setLoading(true)
      try {
        const fetchedTeams = await apiGet<Team[]>(apiRoutes.teams.list).catch(() => [])
        if (isCancelled) return

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
          : finalOptions.length === 1
            ? finalOptions[0].id
            : finalOptions.some((team) => team.id === selectedTeamId)
              ? selectedTeamId
              : null

        setSelectedTeamIdState(nextTeamId)
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      isCancelled = true
    }
  }, [me])

  useEffect(() => {
    if (!me) return
    if (selectedTeamId) {
      window.localStorage.setItem(storageKey(me.id), selectedTeamId)
    } else {
      window.localStorage.removeItem(storageKey(me.id))
    }
  }, [me, selectedTeamId])

  const canSelectTeam = me?.role === 'DIRECTION' || (me?.role === 'COACH' && teamOptions.length > 1)
  const requiresSelection = (me?.role === 'DIRECTION' || me?.role === 'COACH') && teamOptions.length > 1

  const value = useMemo<TeamScopeState>(
    () => ({
      selectedTeamId,
      setSelectedTeamId: setSelectedTeamIdState,
      teamOptions,
      loading,
      requiresSelection,
      canSelectTeam,
    }),
    [selectedTeamId, teamOptions, loading, requiresSelection, canSelectTeam],
  )

  return <TeamScopeCtx.Provider value={value}>{children}</TeamScopeCtx.Provider>
}

export function useTeamScope() {
  const ctx = useContext(TeamScopeCtx)
  if (!ctx) throw new Error('TeamScopeProvider missing')
  return ctx
}
