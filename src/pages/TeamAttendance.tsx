import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { defaultMonth, monthLabel, playerName, rateLabel, statusLabels, type AttendanceReport, type AttendanceStats, type AttendanceTraining, normalizePlayerSearch } from '../features/teamAttendance'
import './TeamAttendance.css'
import AttendanceMonthTable from '../components/AttendanceMonthTable'

function Summary({ stats, title }: { stats: AttendanceStats; title: string }) {
  return <div className="attendance-summary"><div><span>{title}</span><strong>{rateLabel(stats.attendanceRate)}</strong></div></div>
}
function trainingLabel(training: AttendanceTraining) {
  return new Date(training.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
}
export default function TeamAttendance({ teamId }: { teamId: string | null }) {
  const [report, setReport] = useState<AttendanceReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [mode, setMode] = useState<'month' | 'player'>('month')
  const [month, setMonth] = useState('')
  const [query, setQuery] = useState('')
  const [playerId, setPlayerId] = useState('')
  useEffect(() => {
    if (!teamId) return
    let active = true
    setLoading(true); setError(''); setReport(null); setPlayerId(''); setQuery('')
    apiGet<AttendanceReport>(apiRoutes.teams.attendanceReport(teamId)).then((data) => {
      if (active) { setReport(data); setMonth(defaultMonth(data.months)); setPlayerId(''); setQuery(''); setLoading(false) }
    }).catch((err) => { if (active) { setError(toErrorMessage(err)); setLoading(false) } })
    return () => { active = false }
  }, [teamId, retry])
  const current = report?.teamId === teamId ? report : null
  const players = useMemo(() => current?.players.filter((p) => normalizePlayerSearch(playerName(p)).includes(normalizePlayerSearch(query))) ?? [], [current, query])
  const player = current?.players.find((p) => p.id === playerId)
  if (!teamId) return <section className="panel">Sélectionnez une équipe pour consulter les présences.</section>
  return <section className="panel attendance-panel" aria-label="Présences de la saison">

    {loading && <p role="status">Chargement des présences…</p>}
    {error && <div role="alert"><p>{error}</p><button className="players-secondary-btn" onClick={() => setRetry((v) => v + 1)}>Réessayer</button></div>}
    {!loading && !error && current && <>
      <p className="panel-note">Saison en cours : {current.season.label} · Effectif actuel</p>
      <Summary stats={current.summary} title="Présence de l’équipe sur la saison" />
      {!current.players.length && <p>Aucun joueur dans l’effectif actuel.</p>}
      {current.players.length > 0 && <>
      <div className="attendance-modes" aria-label="Vue des présences"><button className={`players-tab-btn ${mode === 'month' ? 'is-active' : ''}`} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Par mois</button><button className={`players-tab-btn ${mode === 'player' ? 'is-active' : ''}`} aria-pressed={mode === 'player'} onClick={() => setMode('player')}>Par joueur</button></div>
      {!current.trainings.length && <p>Aucun entraînement pour cette saison.</p>}
      {mode === 'month' && current.trainings.length > 0 && <>
        <label className="attendance-field">Mois<select value={month} onChange={(e) => setMonth(e.target.value)}>{current.months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}</select></label>
        {current.months.find((m) => m.month === month) && <Summary stats={current.months.find((m) => m.month === month)!.summary} title="Présence du mois" />}
        <AttendanceMonthTable month={month} trainings={current.trainings} players={current.players} />
      </>}
      {mode === 'player' && <div className="attendance-player-scroll"><div className="attendance-player-layout">
        <aside className="attendance-player-sidebar" aria-label="Joueurs">
        <label className="attendance-field">Rechercher un joueur<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom du joueur" /></label>
        {!players.length && <p>Aucun joueur trouvé.</p>}
        <div className="attendance-roster">{players.map((p) => <button className={`attendance-player ${p.id === playerId ? 'is-selected' : ''}`} key={p.id} aria-pressed={p.id === playerId} onClick={() => setPlayerId(p.id)}><span>{playerName(p)}</span><strong>{rateLabel(p.summary.attendanceRate)}</strong></button>)}</div>
        </aside>
        <div className="attendance-player-content">
        {!player && players.length > 0 && <p>Sélectionnez un joueur pour voir le détail de ses présences.</p>}
        {player && <div className="attendance-player-detail"><h2>{playerName(player)}</h2><Summary stats={player.summary} title="Présence sur la saison" />{player.months.map((m) => <section className="attendance-player-month" key={m.month}><h3>{monthLabel(m.month)}</h3><Summary stats={m.summary} title="Présence du mois" /><ul className="attendance-player-sessions">{current.trainings.filter((t) => t.month === m.month).map((t) => { const entry = player.attendances.find((a) => a.trainingId === t.id); return entry && <li key={t.id}><span>{trainingLabel(t)}</span><span className={`attendance-status attendance-status--${entry.status}`}>{statusLabels[entry.status]}</span></li> })}</ul></section>)}</div>}
        </div>
      </div></div>}
      </>}
    </>}
  </section>
}
