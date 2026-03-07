// src/components/PlanningEditor.tsx
import React, { useEffect, useMemo, useState } from 'react'
import AttendanceAccordion from './AttendanceAccordion'

/** ==== Types (compatibles backend) ==== */
export type PlanningData = {
  start: string; // "HH:MM"
  pitches: number;
  matchMin: number;
  breakMin: number;
  forbidIntraClub?: boolean;
  matchesPerTeam?: number;
  restEveryX?: number;
  allowRematches?: boolean;
  regenSeed?: number;
  teams?: TeamEntry[];
  slots: { time: string; games: { pitch: number; A: string; B: string }[] }[];
};

type Team = {
  id: number;
  label: string;
  club: string;
  teamNumber: number | null;
};

type Match = {
  id: string;
  a: Team;
  b: Team;
};

type TeamEntry = {
  label: string;
  color: string;
};

type Props = {
  value?: PlanningData | null;               // planning existant à éditer (facultatif)
  onChange?: (data: PlanningData) => void;   // renvoyé à chaque modification (pour sauvegarde)
  onMetaChange?: (meta: { canSave: boolean; hasGeneratedRotation: boolean; warnings: string[] }) => void;
};

const subtleButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 999,
  background: '#f8fafc',
  color: '#0f172a',
  padding: '8px 12px',
  fontWeight: 700,
}

const stepperButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  width: 32,
  height: 32,
  background: '#fff',
  color: '#0f172a',
  fontWeight: 700,
}

function clamp(value: number, min: number, max?: number) {
  if (!Number.isFinite(value)) return min
  if (max == null) return Math.max(min, value)
  return Math.min(max, Math.max(min, value))
}

/** ==== Fonctions utilitaires (inchangées ou quasi) ==== */
function pad(n: number) { return String(n).padStart(2, '0') }
function parseHHMM(str: string | null) {
  const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return { hh, mm }
}
function addMinutes(base: { hh: number; mm: number }, minutes: number) {
  const d = new Date(2000, 0, 1, base.hh, base.mm, 0, 0)
  d.setMinutes(d.getMinutes() + minutes)
  return { hh: d.getHours(), mm: d.getMinutes() }
}
function fmtTime(t: { hh: number; mm: number }) { return `${pad(t.hh)}:${pad(t.mm)}` }
function normalizeName(name: string) { return name.replace(/\s+/g, ' ').trim() }
function extractClubAndTeam(line: string) {
  const original = normalizeName(line)
  if (!original) return { club: '', teamNumber: null as number | null, label: '' }
  const patterns = [
    /(.*?)[\s-]*(?:U\d+[-\s]*)?(?:équipe\s*)?(\d+)$/i,
    /(.*?)[\s-]*(\d+)$/i,
  ]
  for (const rx of patterns) {
    const m = original.match(rx)
    if (m) {
      const club = normalizeName(m[1])
      const teamNumber = parseInt(m[2], 10)
      return { club, teamNumber, label: original }
    }
  }
  return { club: original, teamNumber: null as number | null, label: original }
}
function parseTeams(text: string): Team[] {
  const lines = (text || '')
    .split(/\r?\n/)
    .map((l) => normalizeName(l))
    .filter(Boolean)
  const teams = lines.map((label, i) => {
    const { club, teamNumber } = extractClubAndTeam(label)
    return { id: i + 1, label, club, teamNumber }
  })
  return teams
}
function generateAllMatches(
  teams: Team[],
  forbidIntraClub = true
) {
  const matches: Match[] = []
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const A = teams[i]; const B = teams[j]
      let allowed = true
      if (forbidIntraClub) {
        const sameClub = A.club && B.club && A.club.toLowerCase() === B.club.toLowerCase()
        if (sameClub) allowed = false
      }
      if (allowed) matches.push({ id: `${A.id}-${B.id}`, a: A, b: B })
    }
  }
  return matches
}

/** ==== RNG + couleurs ==== */
const TEAM_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c2410c',
  '#9333ea', '#0f766e', '#be123c', '#1d4ed8', '#15803d',
  '#b45309', '#6d28d9', '#0e7490', '#b91c1c', '#4338ca',
]

function mulberry32(seed: number) {
  let t = seed >>> 0
  return function () {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
function seededShuffle<T>(arr: T[], seed: number) {
  const a = [...arr]
  const rnd = mulberry32((seed || 1) >>> 0)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildTeamEntries(labels: string[]): TeamEntry[] {
  return labels.map((label, index) => ({
    label,
    color: TEAM_COLORS[index % TEAM_COLORS.length],
  }))
}

/** ==== Limites & packing (inchangés) ==== */
function limitMatchesPerTeam(
  allMatches: Match[],
  teams: Team[],
  perTeam: number,
  allowRematches: boolean,
  seed: number
) {
  if (perTeam <= 0) return [] as typeof allMatches
  const rnd = mulberry32((seed || 1) >>> 0)
  const counts = new Map<number, number>()
  const teamById = new Map<number, Team>()
  for (const t of teams) { counts.set(t.id, 0); teamById.set(t.id, t) }
  const remaining = [...allMatches]
  const picked: typeof allMatches = []

  let progress = true
  while (progress) {
    progress = false
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
    }
    remaining.sort((m1, m2) => {
      const s1 = (counts.get(m1.a.id) ?? 0) + (counts.get(m1.b.id) ?? 0)
      const s2 = (counts.get(m2.a.id) ?? 0) + (counts.get(m2.b.id) ?? 0)
      if (s1 !== s2) return s1 - s2
      const d1 = Math.abs((counts.get(m1.a.id) ?? 0) - (counts.get(m1.b.id) ?? 0))
      const d2 = Math.abs((counts.get(m2.a.id) ?? 0) - (counts.get(m2.b.id) ?? 0))
      if (d1 !== d2) return d2 - d1
      return rnd() < 0.5 ? -1 : 1
    })
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i]; const ca = counts.get(m.a.id) ?? 0; const cb = counts.get(m.b.id) ?? 0
      if (ca < perTeam && cb < perTeam) {
        picked.push(m); counts.set(m.a.id, ca + 1); counts.set(m.b.id, cb + 1); remaining.splice(i, 1); i--; progress = true
      }
    }
  }
  if (allowRematches) {
    const allowedPair = new Set<string>()
    for (const m of allMatches) { const a = Math.min(m.a.id, m.b.id); const b = Math.max(m.a.id, m.b.id); allowedPair.add(`${a}-${b}`) }
    function pairKey(a: number, b: number) { return a < b ? `${a}-${b}` : `${b}-${a}` }
    function currentMinCountTeam(): number | null {
      let min = Infinity; const candidates: number[] = []
      for (const t of teams) {
        const c = counts.get(t.id) ?? 0
        if (c < perTeam) { if (c < min) { min = c; candidates.length = 0; candidates.push(t.id) } else if (c === min) candidates.push(t.id) }
      }
      return candidates.length ? candidates[Math.floor(rnd() * candidates.length)] : null
    }
    const pairUsed = new Map<string, number>()
    for (const m of picked) { const k = pairKey(m.a.id, m.b.id); pairUsed.set(k, (pairUsed.get(k) ?? 0) + 1) }
    let guard = teams.length * perTeam * 3
    while (guard-- > 0) {
      const tA = currentMinCountTeam(); if (tA == null) break
      let bestOpp: number | null = null; let bestOppCount = Infinity; const opp: number[] = []
      for (const t of teams) {
        if (t.id === tA) continue
        const key = pairKey(tA, t.id); if (!allowedPair.has(key)) continue
        const c = counts.get(t.id) ?? 0; if (c >= perTeam) continue
        if (c < bestOppCount) { bestOppCount = c; opp.length = 0; opp.push(t.id) } else if (c === bestOppCount) opp.push(t.id)
      }
      bestOpp = opp.length ? opp[Math.floor(rnd() * opp.length)] : null
      if (bestOpp == null) break
      const key = pairKey(tA, bestOpp); const n = (pairUsed.get(key) ?? 0) + 1; pairUsed.set(key, n)
      const A = teamById.get(tA)!; const B = teamById.get(bestOpp)!
      picked.push({ id: `${key}#${n}`, a: A, b: B })
      counts.set(tA, (counts.get(tA) ?? 0) + 1); counts.set(bestOpp, (counts.get(bestOpp) ?? 0) + 1)
    }
  }
  return picked
}

function packSchedule(matches: Match[], pitches: number, restEveryX: number) {
  const remaining = [...matches]
  const agenda: Array<{ timeIndex: number; games: Array<{ pitch: number; match: Match }> }> = []
  const lastPlayedAt = new Map<number, number>()
  const consec = new Map<number, number>()
  let timeIndex = 0
  while (remaining.length > 0) {
    const usedTeams = new Set<number>()
    const slotGames: Match[] = []
    remaining.sort((m1, m2) => {
      const r1 = Math.min(lastPlayedAt.get(m1.a.id) ?? -999, lastPlayedAt.get(m1.b.id) ?? -999)
      const r2 = Math.min(lastPlayedAt.get(m2.a.id) ?? -999, lastPlayedAt.get(m2.b.id) ?? -999)
      return r1 - r2
    })
    for (let i = 0; i < remaining.length && slotGames.length < pitches; i++) {
      const m = remaining[i]
      if (usedTeams.has(m.a.id) || usedTeams.has(m.b.id)) continue
      let aConsecBefore = 0; let bConsecBefore = 0
      if (lastPlayedAt.get(m.a.id) === timeIndex - 1) aConsecBefore = consec.get(m.a.id) ?? 1
      if (lastPlayedAt.get(m.b.id) === timeIndex - 1) bConsecBefore = consec.get(m.b.id) ?? 1
      if (restEveryX > 0 && (aConsecBefore >= restEveryX || bConsecBefore >= restEveryX)) continue
      slotGames.push(m); usedTeams.add(m.a.id); usedTeams.add(m.b.id)
    }
    if (slotGames.length === 0) { agenda.push({ timeIndex, games: [] }); timeIndex += 1; continue }
    const scheduled = slotGames.map((m, idx) => ({ pitch: idx + 1, match: m })); agenda.push({ timeIndex, games: scheduled })
    for (const m of slotGames) {
      const k = remaining.findIndex((x) => x.id === m.id); if (k >= 0) remaining.splice(k, 1)
      const prevA = lastPlayedAt.get(m.a.id); const prevB = lastPlayedAt.get(m.b.id)
      lastPlayedAt.set(m.a.id, timeIndex); lastPlayedAt.set(m.b.id, timeIndex)
      consec.set(m.a.id, prevA === timeIndex - 1 ? (consec.get(m.a.id) ?? 1) + 1 : 1)
      consec.set(m.b.id, prevB === timeIndex - 1 ? (consec.get(m.b.id) ?? 1) + 1 : 1)
    }
    timeIndex += 1
  }
  return agenda
}

function mergeUniqueLabels(...lists: string[][]) {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const list of lists) {
    for (const item of list) {
      const normalized = normalizeName(item)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      merged.push(normalized)
    }
  }
  return merged
}

/** ==== Composant principal ==== */
const PlanningEditor: React.FC<Props> = ({ value, onChange, onMetaChange }) => {
  // 1) États (initialisés depuis `value` si présent)
  // Hydratation rudimentaire depuis value: reconstruit l'heure de départ / terrains / etc.
  const initial = value ?? { start: '10:00', pitches: 3, matchMin: 10, breakMin: 2, slots: [] }

  // Essaye d’inférer la liste d’équipes à partir des slots pour préremplir (si on vient d’un planning existant)
  const teamsFromValue = React.useMemo(() => {
    if (!value?.slots?.length) return [] as string[]
    const set = new Set<string>()
    for (const s of value.slots) for (const g of s.games) { set.add(g.A); set.add(g.B) }
    return Array.from(set)
  }, [value])

  const [teamHistory, setTeamHistory] = useState<string[]>(teamsFromValue)
  const [teamEntries, setTeamEntries] = useState<TeamEntry[]>(() => {
    const savedTeams = Array.isArray((value as PlanningData | null)?.teams)
      ? ((value as PlanningData).teams ?? []).filter((entry) => normalizeName(entry.label))
      : []
    if (savedTeams.length === 0) return buildTeamEntries(teamsFromValue)
    const merged = [...savedTeams]
    for (const label of teamsFromValue) {
      if (!merged.some((entry) => entry.label === label)) {
        merged.push({ label, color: TEAM_COLORS[merged.length % TEAM_COLORS.length] })
      }
    }
    return merged
  })
  const [newTeamLabel, setNewTeamLabel] = useState('')
  const [teamsOpen, setTeamsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openSlots, setOpenSlots] = useState<number[]>([])
  const [openSlotsAfterRegenerate, setOpenSlotsAfterRegenerate] = useState(false)
  const [pitches, setPitches] = useState(initial.pitches)
  const [matchMin, setMatchMin] = useState(initial.matchMin)
  const [breakMin, setBreakMin] = useState(initial.breakMin)
  const [startHHMM, setStartHHMM] = useState(initial.start)
  const [forbidIntraClub, setForbidIntraClub] = useState(
    typeof value?.forbidIntraClub === 'boolean' ? value.forbidIntraClub : true
  )
  const [regenKey, setRegenKey] = useState(
    typeof value?.regenSeed === 'number' ? value.regenSeed : 1
  )
  const [matchesPerTeam, setMatchesPerTeam] = useState(
    typeof value?.matchesPerTeam === 'number' ? value.matchesPerTeam : 3
  )
  const [restEveryX, setRestEveryX] = useState(
    typeof value?.restEveryX === 'number' ? value.restEveryX : 3
  )
  const [allowRematches, setAllowRematches] = useState(
    typeof value?.allowRematches === 'boolean' ? value.allowRematches : false
  )

  useEffect(() => {
    if (!value) return
    setPitches(typeof value.pitches === 'number' ? clamp(value.pitches, 1) : 3)
    setMatchMin(typeof value.matchMin === 'number' ? clamp(value.matchMin, 1) : 10)
    setBreakMin(typeof value.breakMin === 'number' ? clamp(value.breakMin, 0) : 2)
    setStartHHMM(value.start || '10:00')
    setForbidIntraClub(typeof value.forbidIntraClub === 'boolean' ? value.forbidIntraClub : true)
    setMatchesPerTeam(typeof value.matchesPerTeam === 'number' ? clamp(value.matchesPerTeam, 1) : 3)
    setRestEveryX(typeof value.restEveryX === 'number' ? clamp(value.restEveryX, 1) : 3)
    setAllowRematches(typeof value.allowRematches === 'boolean' ? value.allowRematches : false)
    setRegenKey(typeof value.regenSeed === 'number' ? value.regenSeed : 1)
  }, [
    value,
    setPitches,
    setMatchMin,
    setBreakMin,
    setStartHHMM,
    setForbidIntraClub,
    setMatchesPerTeam,
    setRestEveryX,
    setAllowRematches,
    setRegenKey,
  ])

  // 2) Génération
  const parsedStart = useMemo(() => parseHHMM(startHHMM) || { hh: 10, mm: 0 }, [startHHMM])
  const slotMinutes = matchMin + breakMin
  const teamsList = useMemo(() => teamEntries.map((entry) => entry.label), [teamEntries])
  const teamColorMap = useMemo(
    () => new Map(teamEntries.map((entry) => [entry.label, entry.color] as const)),
    [teamEntries]
  )
  const teamsText = useMemo(() => teamsList.join('\n'), [teamsList])
  const availableTeamSuggestions = useMemo(
    () => teamHistory.filter((teamLabel) => !teamsList.includes(teamLabel)),
    [teamHistory, teamsList]
  )
  const teams = useMemo(() => parseTeams(teamsText), [teamsText])
  const matches = useMemo(() => generateAllMatches(teams, forbidIntraClub), [teams, forbidIntraClub])
  const limitedMatches = useMemo(
    () => limitMatchesPerTeam(matches, teams, Math.max(1, matchesPerTeam), allowRematches, regenKey || 1),
    [matches, teams, matchesPerTeam, allowRematches, regenKey]
  )
  const shuffledMatches = useMemo(() => seededShuffle(limitedMatches, regenKey || 1), [limitedMatches, regenKey])
  const agenda = useMemo(
    () => packSchedule(shuffledMatches, Math.max(1, pitches), Math.max(1, restEveryX)),
    [shuffledMatches, pitches, restEveryX]
  )

  // 3) Remonter le JSON (pour sauvegarde côté parent)
  useEffect(() => {
    const exportObj: PlanningData = {
      start: fmtTime(parsedStart!),
      pitches, matchMin, breakMin,
      forbidIntraClub,
      matchesPerTeam,
      restEveryX,
      allowRematches,
      regenSeed: regenKey,
      teams: teamEntries,
      slots: agenda.map((slot) => ({
        time: fmtTime(addMinutes(parsedStart!, slot.timeIndex * slotMinutes)),
        games: slot.games.map((g) => ({ pitch: g.pitch, A: g.match.a.label, B: g.match.b.label })),
      })),
    }
    onChange?.(exportObj)
  }, [
    agenda,
    parsedStart,
    pitches,
    matchMin,
    breakMin,
    slotMinutes,
    forbidIntraClub,
    matchesPerTeam,
    restEveryX,
    allowRematches,
    regenKey,
    teamEntries,
    onChange,
  ])

  useEffect(() => {
    if (openSlotsAfterRegenerate) {
      setOpenSlots(agenda.map((slot) => slot.timeIndex))
      setOpenSlotsAfterRegenerate(false)
      return
    }
    setOpenSlots([])
  }, [agenda, openSlotsAfterRegenerate])

  // 4) Avertissements
  const warnings = useMemo(() => {
    const nextWarnings: string[] = []
    if (teams.length < 2) nextWarnings.push('Ajoutez au moins 2 équipes.')
    if (matches.length === 0 && teams.length >= 2) nextWarnings.push("Aucun match possible avec ces contraintes (peut-être trop d'équipes d'un même club ?).")
    if (matchesPerTeam >= teams.length) nextWarnings.push("Le nombre de matchs par équipe doit être inférieur au nombre d'équipes.")
    return nextWarnings
  }, [matches.length, matchesPerTeam, teams.length])
  const hasGeneratedRotation = agenda.length > 0
  const canSave = hasGeneratedRotation

  useEffect(() => {
    onMetaChange?.({ canSave, hasGeneratedRotation, warnings })
  }, [canSave, hasGeneratedRotation, onMetaChange, warnings])

  // 5) Actions locales
  const addTeam = () => {
    const nextTeam = normalizeName(newTeamLabel)
    if (!nextTeam) return
    if (teamsList.includes(nextTeam)) {
      setNewTeamLabel('')
      return
    }
    setTeamEntries((prev) => [
      ...prev,
      {
        label: nextTeam,
        color: TEAM_COLORS[prev.length % TEAM_COLORS.length],
      },
    ])
    setTeamHistory((prev) => mergeUniqueLabels(prev, [nextTeam]))
    setNewTeamLabel('')
  }

  const removeTeam = (teamIndex: number) => {
    setTeamEntries((prev) => prev.filter((_, index) => index !== teamIndex))
  }

  const updateTeamColor = (teamIndex: number, color: string) => {
    setTeamEntries((prev) => prev.map((entry, index) => (
      index === teamIndex ? { ...entry, color } : entry
    )))
  }

  const toggleSlot = (timeIndex: number) => {
    setOpenSlots((prev) => (
      prev.includes(timeIndex)
        ? prev.filter((item) => item !== timeIndex)
        : [...prev, timeIndex]
    ))
  }

  const regeneratePlanning = () => {
    setOpenSlotsAfterRegenerate(true)
    setRegenKey(Date.now())
  }

  return (
    <div className="min-h-[50vh]">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <AttendanceAccordion
            title="Equipes"
            countLabel={String(teamEntries.length)}
            isOpen={teamsOpen}
            onToggle={() => setTeamsOpen((prev) => !prev)}
            toggleLabel={teamsOpen ? 'Réduire la section équipes' : 'Ouvrir la section équipes'}
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    background: '#f8fafc',
                  }}
                >
                  <input
                    id="planning-team-input"
                    list="planning-team-suggestions"
                    value={newTeamLabel}
                    onChange={(e) => setNewTeamLabel(e.target.value)}
                    placeholder="Ex: RC Lens 1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTeam()
                      }
                    }}
                  />
                  <datalist id="planning-team-suggestions">
                    {availableTeamSuggestions.map((teamLabel) => (
                      <option key={teamLabel} value={teamLabel} />
                    ))}
                  </datalist>
                  <button type="button" onClick={addTeam} style={subtleButtonStyle}>Ajouter</button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 12,
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  background: '#fff',
                }}
              >
                {teamEntries.map((teamEntry, index) => (
                  <div
                    key={`${teamEntry.label}-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <input
                        type="color"
                        aria-label={`Choisir la couleur pour ${teamEntry.label}`}
                        value={teamEntry.color}
                        onChange={(e) => updateTeamColor(index, e.target.value)}
                        style={{
                          width: 36,
                          height: 36,
                          padding: 0,
                          border: '1px solid #dbe5f1',
                          borderRadius: 999,
                          background: '#fff',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamEntry.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTeam(index)}
                      aria-label={`Retirer ${teamEntry.label}`}
                      style={{
                        width: 34,
                        height: 34,
                        border: '1px solid #fecaca',
                        borderRadius: 999,
                        background: '#fff1f2',
                        color: '#be123c',
                        fontSize: 20,
                        lineHeight: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {teamEntries.length === 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      color: '#64748b',
                      fontSize: 14,
                    }}
                  >
                    Aucune équipe ajoutée.
                  </div>
                )}
              </div>
            </div>
          </AttendanceAccordion>

          <AttendanceAccordion
            title="Réglages"
            countLabel=""
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen((prev) => !prev)}
            toggleLabel={settingsOpen ? 'Réduire les réglages de la rotation' : 'Ouvrir les réglages de la rotation'}
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  Terrains
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setPitches((prev) => clamp(prev - 1, 1))} style={stepperButtonStyle} aria-label="Diminuer le nombre de terrains">−</button>
                    <output style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{pitches}</output>
                    <button type="button" onClick={() => setPitches((prev) => clamp(prev + 1, 1))} style={stepperButtonStyle} aria-label="Augmenter le nombre de terrains">+</button>
                  </div>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  Début
                  <input type="time" value={fmtTime(parsedStart)} onChange={(e) => setStartHHMM(e.target.value)} />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  Durée d'un match (min)
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setMatchMin((prev) => clamp(prev - 1, 1))} style={stepperButtonStyle} aria-label="Diminuer la durée d'un match">−</button>
                    <output style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{matchMin}</output>
                    <button type="button" onClick={() => setMatchMin((prev) => clamp(prev + 1, 1))} style={stepperButtonStyle} aria-label="Augmenter la durée d'un match">+</button>
                  </div>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  Pause entre matchs (min)
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setBreakMin((prev) => clamp(prev - 1, 0))} style={stepperButtonStyle} aria-label="Diminuer la pause entre matchs">−</button>
                    <output style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{breakMin}</output>
                    <button type="button" onClick={() => setBreakMin((prev) => clamp(prev + 1, 0))} style={stepperButtonStyle} aria-label="Augmenter la pause entre matchs">+</button>
                  </div>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  Nombre de matchs par équipe
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setMatchesPerTeam((prev) => clamp(prev - 1, 1, Math.max(1, teams.length - 1)))}
                      style={stepperButtonStyle}
                      aria-label="Diminuer le nombre de matchs par équipe"
                    >
                      −
                    </button>
                    <output style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{matchesPerTeam}</output>
                    <button
                      type="button"
                      onClick={() => setMatchesPerTeam((prev) => clamp(prev + 1, 1, Math.max(1, teams.length - 1)))}
                      style={stepperButtonStyle}
                      aria-label="Augmenter le nombre de matchs par équipe"
                    >
                      +
                    </button>
                  </div>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  Max matchs d'affilée
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setRestEveryX((prev) => clamp(prev - 1, 1))} style={stepperButtonStyle} aria-label="Diminuer le nombre maximal de matchs d'affilée">−</button>
                    <output style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{restEveryX}</output>
                    <button type="button" onClick={() => setRestEveryX((prev) => clamp(prev + 1, 1))} style={stepperButtonStyle} aria-label="Augmenter le nombre maximal de matchs d'affilée">+</button>
                  </div>
                </label>
              </div>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={!forbidIntraClub}
                  onChange={(e) => setForbidIntraClub(!e.target.checked)}
                />
                Autoriser les matchs entre équipes d'un même club
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={allowRematches} onChange={(e) => setAllowRematches(e.target.checked)} />
                Autoriser les rematches si nécessaire (équilibrage)
              </label>
            </div>
          </AttendanceAccordion>

          {hasGeneratedRotation && (
            <button
              type="button"
              onClick={regeneratePlanning}
              style={{ ...subtleButtonStyle, width: '100%' }}
            >
              Régénérer
            </button>
          )}
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {agenda.length === 0 ? (
              <div style={{ padding: '8px', color: '#777' }}>Aucun match planifié.</div>
            ) : (
              agenda.map((slot) => {
                const slotStart = addMinutes(parsedStart!, slot.timeIndex * slotMinutes)
                const time = fmtTime(slotStart)
                const byPitch = new Map(slot.games.map((g) => [g.pitch, g.match] as const))
                const isOpen = openSlots.includes(slot.timeIndex)
                return (
                  <AttendanceAccordion
                    key={slot.timeIndex}
                    title={time}
                    countLabel={`${slot.games.length}/${Math.max(1, pitches)}`}
                    isOpen={isOpen}
                    onToggle={() => toggleSlot(slot.timeIndex)}
                    toggleLabel={isOpen ? `Réduire le créneau de ${time}` : `Ouvrir le créneau de ${time}`}
                  >
                    <div style={{ display: 'grid', gap: 8 }}>
                      {Array.from({ length: Math.max(1, pitches) }, (_, i) => {
                        const match = byPitch.get(i + 1)
                        return (
                          <div
                            key={i}
                            style={{
                              border: '1px solid #e5e7eb',
                              borderRadius: 10,
                              padding: 8,
                              background: '#f8fafc',
                              display: 'grid',
                              gap: 6,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Terrain {i + 1}</div>
                            {match ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={teamColorMap.get(match.a.label) ?? TEAM_COLORS[0]} /></svg>
                                  {match.a.label}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={teamColorMap.get(match.b.label) ?? TEAM_COLORS[1]} /></svg>
                                  {match.b.label}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: 12 }}>— libre —</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </AttendanceAccordion>
                )
              })
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default PlanningEditor
