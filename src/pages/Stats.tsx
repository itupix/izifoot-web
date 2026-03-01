

import { useCallback, useMemo, useState } from 'react'
import { apiGet } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import type { AttendanceRow, MatchLite, Plateau, Player } from '../types/api'

// ---- Helpers ----
function sortByDateAsc<T extends { createdAt: string }>(arr: T[]) { return arr.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) }

type SeriesPoint = { x: number; y: number }
function buildLinePath(points: SeriesPoint[], w: number, h: number, pad = 24) {
  if (!points.length) return ''
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = 0
  const maxY = Math.max(...ys, 1)
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1e-9, maxY - minY)
  const sx = (x: number) => pad + ((x - minX) / spanX) * (w - 2 * pad)
  const sy = (y: number) => (h - pad) - ((y - minY) / spanY) * (h - 2 * pad)
  let d = `M ${sx(points[0].x)} ${sy(points[0].y)}`
  for (let i = 1; i < points.length; i++) d += ` L ${sx(points[i].x)} ${sy(points[i].y)}`
  return d
}

function prettyAvg(v: number) { return (Math.round(v * 100) / 100).toFixed(2) }

export default function StatsPage() {
  const [matches, setMatches] = useState<MatchLite[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [plateaus, setPlateaus] = useState<Plateau[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [viewMode, setViewMode] = useState<'match' | 'plateau'>('match')
  const [rankTab, setRankTab] = useState<'buteurs' | 'entrainements' | 'plateaux'>('buteurs')

  const loadStats = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [rows, plist, plats, attends] = await Promise.all([
      apiGet<MatchLite[]>(apiRoutes.matches.list),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<Plateau[]>(apiRoutes.plateaus.list),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.list)
    ])
    if (isCancelled()) return
    setMatches(rows)
    setPlayers(plist)
    setPlateaus(plats)
    setAttendance(attends)
  }, [])

  const { loading, error } = useAsyncLoader(loadStats)

  const ordered = useMemo(() => sortByDateAsc(matches), [matches])

  // Group matches by plateau (only type PLATEAU) and order groups by earliest createdAt, with plateau label
  const plateauGroups = useMemo(() => {
    const plateauById = new Map(plateaus.map(p => [p.id, p]))
    const byId = new Map<string, { id: string; createdAt: number; matches: MatchLite[]; label: string }>()
    for (const m of ordered) {
      if (m.type !== 'PLATEAU') continue
      const pid = m.plateauId ?? undefined
      const key = pid || `__no_plateau__:${m.id}`
      const label = pid ? (plateauById.get(pid)?.lieu || 'Plateau') : 'Plateau'
      const rec = byId.get(key) || { id: key, createdAt: new Date(m.createdAt).getTime(), matches: [], label }
      rec.matches.push(m)
      if (!byId.has(key)) byId.set(key, rec)
      rec.createdAt = Math.min(rec.createdAt, new Date(m.createdAt).getTime())
    }
    return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt)
  }, [ordered, plateaus])
  const plateauBands = useMemo(() => {
    const palette = ['#fef3c7', '#e0f2fe', '#e9d5ff', '#dcfce7', '#ffe4e6']
    return plateauGroups.map((g, i) => ({ index: i + 1, label: g.label, color: palette[i % palette.length] }))
  }, [plateauGroups])

  // KPIs computed per match (home = nous)
  const { wins, draws, losses } = useMemo(() => {
    let w = 0, d = 0, l = 0
    ordered.forEach((m) => {
      const home = m.teams.find(t => t.side === 'home')
      const away = m.teams.find(t => t.side === 'away')
      const gf = home?.score ?? 0
      const ga = away?.score ?? 0
      if (gf > ga) w++; else if (gf === ga) d++; else l++
    })
    return { wins: w, draws: d, losses: l }
  }, [ordered])

  // Total goals scored and conceded (home = nous)
  const { totalFor, totalAgainst } = useMemo(() => {
    let totalFor = 0, totalAgainst = 0
    ordered.forEach((m) => {
      const home = m.teams.find(t => t.side === 'home')
      const away = m.teams.find(t => t.side === 'away')
      totalFor += home?.score ?? 0
      totalAgainst += away?.score ?? 0
    })
    return { totalFor, totalAgainst }
  }, [ordered])

  // Build series for charts, switchable per match / per plateau
  const { avgForSeries, avgAgainstSeries, lastAvgFor, lastAvgAgainst } = useMemo(() => {
    // per-match cumulative averages
    const pm_for: { x: number; y: number }[] = []
    const pm_against: { x: number; y: number }[] = []
    let sumFor = 0, sumAgainst = 0
    ordered.forEach((m, i) => {
      const gf = m.teams.find(t => t.side === 'home')?.score ?? 0
      const ga = m.teams.find(t => t.side === 'away')?.score ?? 0
      sumFor += gf; sumAgainst += ga
      const idx = i + 1
      pm_for.push({ x: idx, y: sumFor / idx })
      pm_against.push({ x: idx, y: sumAgainst / idx })
    })

    // per-plateau: average goals per plateau, then cumulative average across plateaus
    const pp_for: { x: number; y: number }[] = []
    const pp_against: { x: number; y: number }[] = []
    let psFor = 0, psAgainst = 0
    plateauGroups.forEach((g, i) => {
      if (g.matches.length === 0) return
      let gfSum = 0, gaSum = 0
      for (const m of g.matches) {
        gfSum += m.teams.find(t => t.side === 'home')?.score ?? 0
        gaSum += m.teams.find(t => t.side === 'away')?.score ?? 0
      }
      const gfAvg = gfSum / g.matches.length
      const gaAvg = gaSum / g.matches.length
      psFor += gfAvg; psAgainst += gaAvg
      const idx = i + 1
      pp_for.push({ x: idx, y: psFor / idx })
      pp_against.push({ x: idx, y: psAgainst / idx })
    })

    const usePlateau = viewMode === 'plateau'
    const F = usePlateau ? pp_for : pm_for
    const A = usePlateau ? pp_against : pm_against
    return {
      avgForSeries: F,
      avgAgainstSeries: A,
      lastAvgFor: F.length ? F[F.length - 1].y : 0,
      lastAvgAgainst: A.length ? A[A.length - 1].y : 0
    }
  }, [ordered, plateauGroups, viewMode])

  const scorerTable = useMemo(() => {
    // Map playerId -> goals (we count only 'home' side as notre équipe)
    const tally = new Map<string, number>()
    for (const m of ordered) {
      const list = m.scorers || []
      for (const s of list) {
        if (s.side !== 'home') continue
        tally.set(s.playerId, (tally.get(s.playerId) || 0) + 1)
      }
    }
    // Join with player names
    const nameById = new Map(players.map(p => [p.id, p.name] as const))
    const rows = Array.from(tally.entries()).map(([playerId, goals]) => ({
      playerId,
      name: nameById.get(playerId) || playerId,
      goals
    }))
    rows.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    return rows
  }, [ordered, players])

  // Attendance presence rankings
  const { trainingPresence, plateauPresence } = useMemo(() => {
    const nameById = new Map(players.map(p => [p.id, p.name] as const))

    // Initialize everyone to 0 so players with zero are included
    const tCount = new Map<string, number>()
    const pCount = new Map<string, number>()
    for (const p of players) { tCount.set(p.id, 0); pCount.set(p.id, 0) }

    for (const a of attendance) {
      if (a.session_type === 'TRAINING') {
        tCount.set(a.playerId, (tCount.get(a.playerId) || 0) + 1)
      } else if (a.session_type === 'PLATEAU') {
        pCount.set(a.playerId, (pCount.get(a.playerId) || 0) + 1)
      }
    }

    // Include ALL players (even 0) for both rankings
    const trainingPresence = players.map(p => ({
      playerId: p.id,
      name: nameById.get(p.id) || p.id,
      count: tCount.get(p.id) || 0
    }))

    const plateauPresence = players.map(p => ({
      playerId: p.id,
      name: nameById.get(p.id) || p.id,
      count: pCount.get(p.id) || 0
    }))

    trainingPresence.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    plateauPresence.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    return { trainingPresence, plateauPresence }
  }, [attendance, players])

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Statistiques</h2>

      {loading && <div style={{ color: '#9ca3af' }}>Chargement…</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {/* KPI: Buts marqués / encaissés */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, margin: '12px 0' }}>
        <KpiCard label="Buts marqués" value={totalFor} />
        <KpiCard label="Buts encaissés" value={totalAgainst} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '12px 0' }}>
        <KpiCard label="Victoires" value={wins} tone="#16a34a" />
        <KpiCard label="Nuls" value={draws} tone="#6b7280" />
        <KpiCard label="Défaites" value={losses} tone="#ef4444" />
      </section>

      {/* Classements (onglets) */}
      <div style={{ display: 'inline-flex', gap: 8, margin: '8px 0' }}>
        <button onClick={() => setRankTab('buteurs')} style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', background: rankTab === 'buteurs' ? '#e0f2fe' : '#fff' }}>Buteurs</button>
        <button onClick={() => setRankTab('entrainements')} style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', background: rankTab === 'entrainements' ? '#e0f2fe' : '#fff' }}>Présences (Entraînements)</button>
        <button onClick={() => setRankTab('plateaux')} style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', background: rankTab === 'plateaux' ? '#e0f2fe' : '#fff' }}>Présences (Plateaux)</button>
      </div>

      {rankTab === 'buteurs' && (
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>Classement des buteurs</h3>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Notre équipe (buts côté Home)</span>
          </div>
          {scorerTable.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>Pas encore de buteurs enregistrés.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>Joueur</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>Buts</th>
                </tr>
              </thead>
              <tbody>
                {scorerTable.map((r, i) => (
                  <tr key={r.playerId}>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6' }}>{i + 1}</td>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6' }}>{r.name}</td>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700 }}>{r.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {rankTab === 'entrainements' && (
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>Présences aux entraînements</h3>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Nombre de séances</span>
          </div>
          {trainingPresence.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>Aucune présence enregistrée.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>Joueur</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>Présences</th>
                </tr>
              </thead>
              <tbody>
                {trainingPresence.map((r, i) => (
                  <tr key={`tp-${r.playerId}`}>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6' }}>{i + 1}</td>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6' }}>{r.name}</td>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {rankTab === 'plateaux' && (
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>Présences aux plateaux</h3>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Nombre de plateaux</span>
          </div>
          {plateauPresence.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>Aucune présence enregistrée.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>Joueur</th>
                  <th style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', padding: '6px 4px' }}>Présences</th>
                </tr>
              </thead>
              <tbody>
                {plateauPresence.map((r, i) => (
                  <tr key={`pp-${r.playerId}`}>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6' }}>{i + 1}</td>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6' }}>{r.name}</td>
                    <td style={{ padding: '6px 4px', borderTop: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <div style={{ display: 'inline-flex', gap: 8, margin: '8px 0' }}>
        <button onClick={() => setViewMode('match')} style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', background: viewMode === 'match' ? '#e0f2fe' : '#fff' }}>Par match</button>
        <button onClick={() => setViewMode('plateau')} style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', background: viewMode === 'plateau' ? '#e0f2fe' : '#fff' }}>Par plateau</button>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <Chart
          title={`Évolution du nombre moyen de buts marqués (${viewMode === 'match' ? 'par match' : 'par plateau'} – actuel: ${prettyAvg(lastAvgFor)})`}
          series={avgForSeries}
          bands={viewMode === 'plateau' ? plateauBands : undefined}
        />
        <Chart
          title={`Évolution du nombre moyen de buts encaissés (${viewMode === 'match' ? 'par match' : 'par plateau'} – actuel: ${prettyAvg(lastAvgAgainst)})`}
          series={avgAgainstSeries}
          bands={viewMode === 'plateau' ? plateauBands : undefined}
        />
      </section>
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: tone || '#111827' }}>{value}</div>
    </div>
  )
}

function Chart({ title, series, bands }: { title: string; series: SeriesPoint[]; bands?: { index: number; label?: string; color?: string }[] }) {
  const w = 720, h = 220, pad = 28
  const d = buildLinePath(series, w, h, pad)
  // axes limits and value stats for y-axis
  const values = series.map(p => p.y)
  const minY = values.length > 0 ? Math.min(...values) : 0
  const maxY = values.length > 0 ? Math.max(...values) : 1
  const avgY = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  // x scale helpers
  const minX = series.length > 0 ? series[0].x : 1
  const spanX = Math.max(1, (series.length > 0 ? series[series.length - 1].x : 1) - minX)
  const sx = (x: number) => pad + ((x - minX) / spanX) * (w - 2 * pad)

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>{title}</div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
        {/* axes */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e7eb" />
        {/* plateau background bands */}
        {bands && bands.length > 0 && (
          <g>
            {bands.map((b, i) => {
              const cell = (w - 2 * pad) / Math.max(1, spanX)
              const cx = sx(b.index)
              const x0 = cx - cell / 2
              const x1 = cx + cell / 2
              return (
                <g key={`band-${i}`}>
                  <rect x={x0} y={pad} width={Math.max(0, x1 - x0)} height={h - 2 * pad} fill={b.color || '#f1f5f9'} opacity={0.5} />
                  {b.label && (
                    <text x={cx} y={pad + 12} textAnchor="middle" fontSize={10} fill="#374151">{b.label}</text>
                  )}
                </g>
              )
            })}
          </g>
        )}
        {/* horizontal gridlines and labels for min/avg/max */}
        {series.length > 0 && (() => {
          const sy = (y: number) => (h - pad) - ((y - 0) / Math.max(1e-9, maxY - 0)) * (h - 2 * pad)
          const labelStyle = { fontSize: 10, fill: '#6b7280' }
          return (
            <g>
              {/* Min line */}
              <line x1={pad} x2={w - pad} y1={sy(minY)} y2={sy(minY)} stroke="#e5e7eb" strokeDasharray="2 2" />
              <text x={4} y={sy(minY) + 3} {...labelStyle}>min {prettyAvg(minY)}</text>
              {/* Avg line */}
              <line x1={pad} x2={w - pad} y1={sy(avgY)} y2={sy(avgY)} stroke="#d1d5db" strokeDasharray="4 2" />
              <text x={4} y={sy(avgY) + 3} {...labelStyle}>moy {prettyAvg(avgY)}</text>
              {/* Max line */}
              <line x1={pad} x2={w - pad} y1={sy(maxY)} y2={sy(maxY)} stroke="#9ca3af" strokeDasharray="2 2" />
              <text x={4} y={sy(maxY) - 3} {...labelStyle}>max {prettyAvg(maxY)}</text>
            </g>
          )
        })()}
        {/* ticks (quartiles) */}
        {Array.from({ length: 4 }, (_, i) => i + 1).map(i => (
          <g key={`q-${i}`}>
            <line x1={pad + (i / 4) * (w - 2 * pad)} y1={h - pad} x2={pad + (i / 4) * (w - 2 * pad)} y2={h - pad + 4} stroke="#9ca3af" />
          </g>
        ))}
        {/* per-match markers on x-axis */}
        {series.length > 0 && !bands && (() => {
          const minX = series[0].x
          const maxX = series[series.length - 1].x
          const spanX = Math.max(1, maxX - minX)
          const sx = (x: number) => pad + ((x - minX) / spanX) * (w - 2 * pad)
          return (
            <g>
              {series.map((p, idx) => (
                <line key={`m-${idx}`} x1={sx(p.x)} y1={h - pad} x2={sx(p.x)} y2={h - pad + 6} stroke="#cbd5e1" />
              ))}
            </g>
          )
        })()}
        {/* line */}
        {series.length > 0 ? (
          <path d={d} fill="none" stroke="#2563eb" strokeWidth={2} />
        ) : (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="#9ca3af">Pas encore de données</text>
        )}
      </svg>
    </div>
  )
}
