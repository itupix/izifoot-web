// src/components/PlanningEditor.tsx
import React, { useEffect, useMemo, useState } from 'react'

/** ==== Types (compatibles backend) ==== */
export type PlanningData = {
  start: string; // "HH:MM"
  pitches: number;
  matchMin: number;
  breakMin: number;
  slots: { time: string; games: { pitch: number; A: string; B: string }[] }[];
};

type Props = {
  value?: PlanningData | null;               // planning existant à éditer (facultatif)
  onChange?: (data: PlanningData) => void;   // renvoyé à chaque modification (pour sauvegarde)
  title?: string;                            // titre optionnel
};

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
function parseTeams(text: string) {
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
function csvEscape(value: unknown) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function downloadCSV(filename: string, rows: Array<Array<string>>) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
function generateAllMatches(
  teams: Array<{ id: number; label: string; club: string; teamNumber: number | null }>,
  forbidIntraClub = true,
  only12 = false
) {
  const matches: Array<{ id: string; a: any; b: any }> = []
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const A = teams[i]; const B = teams[j]
      let allowed = true
      if (forbidIntraClub) {
        if (only12) {
          const sameClub = A.club && B.club && A.club.toLowerCase() === B.club.toLowerCase()
          const s12 = sameClub && ((A.teamNumber === 1 && B.teamNumber === 2) || (A.teamNumber === 2 && B.teamNumber === 1))
          if (s12) allowed = false
        } else {
          const sameClub = A.club && B.club && A.club.toLowerCase() === B.club.toLowerCase()
          if (sameClub) allowed = false
        }
      }
      if (allowed) matches.push({ id: `${A.id}-${B.id}`, a: A, b: B })
    }
  }
  return matches
}

/** ==== RNG + couleurs ==== */
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
function hashStringHue(s: string) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0 } return h % 360 }
function teamColor(label: string) { const hue = hashStringHue(label); return `hsl(${hue}, 70%, 45%)` }

/** ==== Limites & packing (inchangés) ==== */
function limitMatchesPerTeam(
  allMatches: Array<{ id: string; a: { id: number; label?: string }; b: { id: number; label?: string } }>,
  teams: Array<{ id: number; label?: string }>,
  perTeam: number,
  allowRematches: boolean,
  seed: number
) {
  if (perTeam <= 0) return [] as typeof allMatches
  const rnd = mulberry32((seed || 1) >>> 0)
  function pickRandom<T>(arr: T[]): T | null { if (!arr.length) return null; return arr[Math.floor(rnd() * arr.length)] }
  const counts = new Map<number, number>()
  const teamById = new Map<number, { id: number; label?: string }>()
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
      picked.push({ id: `${key}#${n}`, a: A, b: B } as any)
      counts.set(tA, (counts.get(tA) ?? 0) + 1); counts.set(bestOpp, (counts.get(bestOpp) ?? 0) + 1)
    }
  }
  return picked
}

function packSchedule(matches: any[], teams: any[], pitches: number, restEveryX: number) {
  const remaining = [...matches]
  const agenda: Array<{ timeIndex: number; games: Array<{ pitch: number; match: any }> }> = []
  const lastPlayedAt = new Map<number, number>()
  const consec = new Map<number, number>()
  let timeIndex = 0
  while (remaining.length > 0) {
    const usedTeams = new Set<number>()
    const slotGames: any[] = []
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

function toRowsForCSV(
  agenda: Array<{ timeIndex: number; games: Array<{ pitch: number; match: any }> }>,
  start: { hh: number; mm: number },
  slotMinutes: number
) {
  const rows = [["Heure", "Terrain", "Équipe A", "Équipe B"]]
  for (const slot of agenda) {
    const time = fmtTime(addMinutes(start, slot.timeIndex * slotMinutes))
    for (const g of slot.games) rows.push([time, `Terrain ${g.pitch}`, g.match.a.label, g.match.b.label])
  }
  return rows
}

/** ==== Hook de persistance locale (facultatif) ==== */
function useLocalStorageState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); if (raw != null) return JSON.parse(raw) as T } catch { }
    return initialValue
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)) } catch { } }, [key, state])
  return [state, setState] as const
}

/** ==== Composant principal ==== */
const PlanningEditor: React.FC<Props> = ({ value, onChange, title }) => {
  // 1) États (initialisés depuis `value` si présent)
  // Hydratation rudimentaire depuis value: reconstruit l'heure de départ / terrains / etc.
  const initial = value ?? { start: '10:00', pitches: 3, matchMin: 10, breakMin: 2, slots: [] }

  // Essaye d’inférer la liste d’équipes à partir des slots pour préremplir (si on vient d’un planning existant)
  const teamsFromValue = React.useMemo(() => {
    if (!value?.slots?.length) return ''
    const set = new Set<string>()
    for (const s of value.slots) for (const g of s.games) { set.add(g.A); set.add(g.B) }
    return Array.from(set).join('\n')
  }, [value])

  const [teamsText, setTeamsText] = useLocalStorageState('u9plateau.teams', teamsFromValue || [
    'US Flinois 1', 'US Flinois 2', 'RC Lens 1', 'RC Lens 2', 'US Orchies', 'US Templeuve',
  ].join('\n'))
  const [pitches, setPitches] = useLocalStorageState('u9plateau.pitches', initial.pitches)
  const [matchMin, setMatchMin] = useLocalStorageState('u9plateau.matchMin', initial.matchMin)
  const [breakMin, setBreakMin] = useLocalStorageState('u9plateau.breakMin', initial.breakMin)
  const [startHHMM, setStartHHMM] = useLocalStorageState('u9plateau.startHHMM', initial.start)
  const [forbidIntraClub, setForbidIntraClub] = useLocalStorageState('u9plateau.forbidIntraClub', true)
  const [only12, setOnly12] = useLocalStorageState('u9plateau.only12', false)
  const [regenKey, setRegenKey] = useLocalStorageState('u9plateau.regenSeed', 1)
  const [matchesPerTeam, setMatchesPerTeam] = useLocalStorageState('u9plateau.matchesPerTeam', 3)
  const [restEveryX, setRestEveryX] = useLocalStorageState('u9plateau.restEveryX', 1)
  const [allowRematches, setAllowRematches] = useLocalStorageState('u9plateau.allowRematches', true)

  // 2) Génération
  const parsedStart = useMemo(() => parseHHMM(startHHMM) || { hh: 10, mm: 0 }, [startHHMM])
  const slotMinutes = matchMin + breakMin
  const teams = useMemo(() => parseTeams(teamsText), [teamsText, regenKey])
  const matches = useMemo(() => generateAllMatches(teams, forbidIntraClub, only12), [teams, forbidIntraClub, only12, regenKey])
  const limitedMatches = useMemo(
    () => limitMatchesPerTeam(matches, teams, Math.max(1, matchesPerTeam), allowRematches, regenKey || 1),
    [matches, teams, matchesPerTeam, allowRematches, regenKey]
  )
  const shuffledMatches = useMemo(() => seededShuffle(limitedMatches, regenKey || 1), [limitedMatches, regenKey])
  const agenda = useMemo(
    () => packSchedule(shuffledMatches, teams, Math.max(1, pitches), Math.max(1, restEveryX)),
    [shuffledMatches, teams, pitches, restEveryX]
  )

  // 3) Remonter le JSON (pour sauvegarde côté parent)
  useEffect(() => {
    const exportObj: PlanningData = {
      start: fmtTime(parsedStart!),
      pitches, matchMin, breakMin,
      slots: agenda.map((slot) => ({
        time: fmtTime(addMinutes(parsedStart!, slot.timeIndex * slotMinutes)),
        games: slot.games.map((g) => ({ pitch: g.pitch, A: g.match.a.label, B: g.match.b.label })),
      })),
    }
    onChange?.(exportObj)
  }, [agenda, parsedStart, pitches, matchMin, breakMin, slotMinutes, onChange])

  // 4) Avertissements
  const warnings: string[] = []
  if (teams.length < 2) warnings.push('Ajoutez au moins 2 équipes.')
  if (matches.length === 0 && teams.length >= 2) warnings.push("Aucun match possible avec ces contraintes (peut-être trop d'équipes d'un même club ?).")
  if (matchesPerTeam >= teams.length) warnings.push("Le nombre de matchs par équipe doit être inférieur au nombre d'équipes.")

  // 5) Actions locales
  const handleCSV = () => {
    const rows = toRowsForCSV(agenda, parsedStart!, slotMinutes)
    downloadCSV('planning_plateau_u9.csv', rows)
  }
  const handlePrint = () => window.print()

  return (
    <div className="min-h-[50vh]">
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{title ?? 'Éditeur de planning'}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setRegenKey(Date.now())}>Régénérer</button>
          <button onClick={handleCSV}>Export CSV</button>
          <button onClick={handlePrint}>Imprimer</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
          <label>Équipes (une par ligne)
            <textarea rows={10} value={teamsText} onChange={(e) => setTeamsText(e.target.value)} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>Terrains
              <input type="number" min={1} value={pitches}
                onChange={(e) => { const v = parseInt(e.target.value || '1', 10); (Number.isNaN(v) ? setPitches(1) : setPitches(v)) }} />
            </label>
            <label>Début (HH:MM)
              <input value={startHHMM} onChange={(e) => setStartHHMM(e.target.value)} placeholder="10:00" />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>Durée d'un match (min)
              <input type="number" min={1} value={matchMin}
                onChange={(e) => { const v = parseInt(e.target.value || '10', 10); (Number.isNaN(v) ? setMatchMin(10) : setMatchMin(v)) }} />
            </label>
            <label>Pause entre matchs (min)
              <input type="number" min={0} value={breakMin}
                onChange={(e) => { const v = parseInt(e.target.value || '0', 10); (Number.isNaN(v) ? setBreakMin(0) : setBreakMin(v)) }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>Nombre de matchs par équipe
              <input type="number" min={1} max={Math.max(1, teams.length - 1)} value={matchesPerTeam}
                onChange={(e) => { const v = parseInt(e.target.value || '1', 10); (Number.isNaN(v) ? setMatchesPerTeam(1) : setMatchesPerTeam(v)) }} />
            </label>
            <label>Repos obligatoire (X consécutifs max)
              <input type="number" min={1} value={restEveryX}
                onChange={(e) => { const v = parseInt(e.target.value || '1', 10); (Number.isNaN(v) ? setRestEveryX(1) : setRestEveryX(v)) }} />
            </label>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={forbidIntraClub} onChange={(e) => setForbidIntraClub(e.target.checked)} />
            Interdire les matchs entre équipes d'un même club
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: forbidIntraClub ? 1 : 0.5 }}>
            <input type="checkbox" disabled={!forbidIntraClub} checked={only12} onChange={(e) => setOnly12(e.target.checked)} />
            (Option) N'interdire que 1 vs 2 d'un même club
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={allowRematches} onChange={(e) => setAllowRematches(e.target.checked)} />
            Autoriser les rematches si nécessaire (équilibrage)
          </label>

          {warnings.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8a5a00', background: '#fff8e1', border: '1px solid #ffecb5', borderRadius: 8, padding: 8 }}>
              {warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Heure</th>
                {Array.from({ length: Math.max(1, pitches) }, (_, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '4px 8px' }}>Terrain {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agenda.length === 0 ? (
                <tr><td colSpan={pitches + 1} style={{ padding: '8px', color: '#777' }}>Aucun match planifié.</td></tr>
              ) : (
                agenda.map((slot) => {
                  const slotStart = addMinutes(parsedStart!, slot.timeIndex * slotMinutes)
                  const time = fmtTime(slotStart)
                  const byPitch = new Map(slot.games.map((g: any) => [g.pitch, g.match]))
                  return (
                    <tr key={slot.timeIndex}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{time}</td>
                      {Array.from({ length: Math.max(1, pitches) }, (_, i) => {
                        const match = byPitch.get(i + 1)
                        return (
                          <td key={i} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                            {match ? (
                              <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={teamColor(match.a.label)} /></svg>
                                  {match.a.label}
                                </div>
                                <div style={{ fontSize: 12, textAlign: 'center', opacity: 0.6, margin: '4px 0' }}>vs</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={teamColor(match.b.label)} /></svg>
                                  {match.b.label}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontStyle: 'italic', color: '#aaa', fontSize: 12 }}>— libre —</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            Matchs de {matchMin} min + pause {breakMin} min (total {slotMinutes} min / créneau).<br />
            Règle de repos : 1 match de repos tous les {restEveryX} match(s) consécutifs max.
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlanningEditor