

import React, { useEffect, useMemo, useState } from 'react'

// ---- Minimal API helpers (same style as other pages) ----
const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) || ''
function full(url: string) { return API_BASE ? `${API_BASE}${url}` : url }
function bust(url: string) { const u = new URL(url, window.location.origin); u.searchParams.set('_', Date.now().toString()); return u.pathname + u.search }
function getAuthHeaders() { const t = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null; return t ? { Authorization: `Bearer ${t}` } : {} }
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(bust(full(url)), { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text());
  return res.json()
}

// ---- Types (subset of backend) ----
interface MatchTeam { id: string; side: 'home' | 'away'; score: number }
interface Scorer { playerId: string; side: 'home' | 'away' }
interface MatchLite { id: string; createdAt: string; type: 'ENTRAINEMENT' | 'PLATEAU'; teams: MatchTeam[]; scorers?: Scorer[] }
interface Player { id: string; name: string }

// ---- Helpers ----
function sortByDateAsc<T extends { createdAt: string }>(arr: T[]) { return arr.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) }

type SeriesPoint = { x: number; y: number }
function buildLinePath(points: SeriesPoint[], w: number, h: number, pad = 24) {
  if (!points.length) return ''
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const [rows, plist] = await Promise.all([
          apiGet<MatchLite[]>('/api/matches'),
          apiGet<Player[]>('/api/players')
        ])
        if (!cancelled) { setMatches(rows); setPlayers(plist) }
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const ordered = useMemo(() => sortByDateAsc(matches), [matches])

  // NOTE: on considère l'équipe "home" comme la nôtre
  const { wins, draws, losses, avgForSeries, avgAgainstSeries, lastAvgFor, lastAvgAgainst } = useMemo(() => {
    let w = 0, d = 0, l = 0
    const cumFor: number[] = []
    const cumAgainst: number[] = []
    const avgForSeries: SeriesPoint[] = []
    const avgAgainstSeries: SeriesPoint[] = []
    let sumFor = 0, sumAgainst = 0

    ordered.forEach((m, i) => {
      const home = m.teams.find(t => t.side === 'home')
      const away = m.teams.find(t => t.side === 'away')
      const gf = home?.score ?? 0
      const ga = away?.score ?? 0
      if (gf > ga) w++; else if (gf === ga) d++; else l++
      sumFor += gf; sumAgainst += ga
      const idx = i + 1
      cumFor.push(sumFor); cumAgainst.push(sumAgainst)
      avgForSeries.push({ x: idx, y: sumFor / idx })
      avgAgainstSeries.push({ x: idx, y: sumAgainst / idx })
    })

    return {
      wins: w, draws: d, losses: l,
      avgForSeries, avgAgainstSeries,
      lastAvgFor: avgForSeries.length ? avgForSeries[avgForSeries.length - 1].y : 0,
      lastAvgAgainst: avgAgainstSeries.length ? avgAgainstSeries[avgAgainstSeries.length - 1].y : 0
    }
  }, [ordered])

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

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Statistiques</h2>

      {loading && <div style={{ color: '#9ca3af' }}>Chargement…</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '12px 0' }}>
        <KpiCard label="Victoires" value={wins} tone="#16a34a" />
        <KpiCard label="Nuls" value={draws} tone="#6b7280" />
        <KpiCard label="Défaites" value={losses} tone="#ef4444" />
      </section>

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

      <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <Chart
          title={`Évolution du nombre moyen de buts marqués (actuel: ${prettyAvg(lastAvgFor)})`}
          series={avgForSeries}
        />
        <Chart
          title={`Évolution du nombre moyen de buts encaissés (actuel: ${prettyAvg(lastAvgAgainst)})`}
          series={avgAgainstSeries}
        />
      </section>

      <div style={{ marginTop: 16, fontSize: 12, color: '#6b7280' }}>
        <div>Hypothèse: l'équipe "home" est considérée comme la nôtre pour les résultats et le classement des buteurs.</div>
        <div>Total matchs pris en compte: {matches.length}</div>
      </div>
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

function Chart({ title, series }: { title: string; series: SeriesPoint[] }) {
  const w = 720, h = 220, pad = 28
  const d = buildLinePath(series, w, h, pad)
  // axes limits for ticks
  const maxX = series.length > 0 ? series[series.length - 1].x : 1
  const maxY = series.length > 0 ? Math.max(...series.map(p => p.y)) : 1

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>{title}</div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
        {/* axes */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e7eb" />
        {/* ticks (quartiles) */}
        {Array.from({ length: 4 }, (_, i) => i + 1).map(i => (
          <g key={`q-${i}`}>
            <line x1={pad + (i / 4) * (w - 2 * pad)} y1={h - pad} x2={pad + (i / 4) * (w - 2 * pad)} y2={h - pad + 4} stroke="#9ca3af" />
          </g>
        ))}
        {/* per-match markers on x-axis */}
        {series.length > 0 && (() => {
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