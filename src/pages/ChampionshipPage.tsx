import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, apiPut, apiPatch } from '../apiClient'
import { useTeamScope } from '../useTeamScope'
import { championshipPath, localInput, reorderUndated, type ChampionshipResponse, type Fixture } from '../features/championship'
import './ChampionshipPage.css'

export default function ChampionshipPage() {
  const { selectedTeamId, teamOptions } = useTeamScope()
  const [data, setData] = useState<ChampionshipResponse | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('calendar'), [name, setName] = useState(''), [opponents, setOpponents] = useState(''), [doubleRoundRobin, setDouble] = useState(true)
  const [drag, setDrag] = useState<string | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setData(null); setError(''); setName(''); setOpponents(''); setTab('calendar'); setDouble(true)
    if (selectedTeamId) apiGet<ChampionshipResponse>(`/championship?teamId=${encodeURIComponent(selectedTeamId)}`).then(result => { if (generation.current === current) setData(result) }).catch(err => { if (generation.current === current) setError(err.message) })
    return () => { generation.current++ }
  }, [selectedTeamId])
  const c = data?.championship
  async function mutate(action: () => Promise<ChampionshipResponse>) {
    const current = generation.current
    setBusy(true); setError('')
    try { const result = await action(); if (current === generation.current) setData(result) }
    catch (err) { if (current === generation.current) setError(`${err instanceof Error ? err.message : 'Une erreur est survenue'}. Rechargez le championnat avant de réessayer si un autre utilisateur l’a modifié.`) }
    finally { setBusy(false) }
  }
  const teamName = (id: string) => c?.teams.find(t => t.id === id)?.name || 'Équipe'
  const fixtures = [...(c?.fixtures || [])].sort((a,b) => a.order-b.order)
  function move(f: Fixture, direction: number) {
    const undated = fixtures.filter(item => !item.kickoffAt)
    const target = undated[undated.findIndex(item => item.id === f.id)+direction]
    if (target && c) void mutate(() => apiPut(`${championshipPath(c.id)}/order`, {revision:c.revision, fixtureIds:reorderUndated(fixtures, f.id, target.id)}))
  }
  return <main className="championship-page">
    <h1>Championnat</h1>
    {error && <p role="alert" className="championship-error">{error} <button onClick={()=>window.location.reload()}>Recharger</button></p>}
    {!selectedTeamId ? <p>Sélectionnez une équipe pour consulter son championnat.</p> : !data ? error ? <button onClick={()=>window.location.reload()}>Recharger le championnat</button> : <p>Chargement du championnat…</p> : !c ? data.canManage ? <form className="championship-setup" onSubmit={e => { e.preventDefault(); void mutate(() => apiPost('/championship', {teamId:selectedTeamId, name:name.trim(), teams:opponents.split('\n').map(s=>s.trim()).filter(Boolean), doubleRoundRobin})) }}>
      <h2>Créer le championnat</h2><p>Votre équipe ({teamOptions.find(t=>t.id===selectedTeamId)?.name || 'équipe active'}) est incluse automatiquement. Ajoutez de 1 à 31 adversaires. Les participants ne pourront plus être modifiés après la création.</p>
      <label>Nom du championnat<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>Équipes adverses, une par ligne<textarea required rows={6} value={opponents} onChange={e=>setOpponents(e.target.value)} /></label>
      <label><input type="checkbox" checked={doubleRoundRobin} onChange={e=>setDouble(e.target.checked)} /> Matchs aller-retour</label>
      <button disabled={busy}>Générer le calendrier</button>
    </form> : <p>Aucun championnat pour cette équipe. Le staff peut en créer un.</p> : <>
      <h2>{c.name}</h2><p>{c.status === 'DRAFT' ? 'Brouillon — les rencontres apparaîtront dans le planning après validation.' : 'Calendrier validé'} · {c.teams.length} équipes · {c.doubleRoundRobin ? 'Aller-retour' : 'Matchs aller'}</p>
      <div role="tablist" aria-label="Championnat"><button role="tab" aria-selected={tab==='calendar'} onClick={()=>setTab('calendar')}>Calendrier</button><button role="tab" aria-selected={tab==='standings'} onClick={()=>setTab('standings')}>Classement</button></div>
      {tab === 'standings' ? <section>{!c.fixtures.some(f=>f.homeScore!==null) && <p>Aucun résultat enregistré.</p>}<p>Classement indicatif, calculé à partir des résultats saisis : victoire 3 points, nul 1 point. Départage : différence de buts, buts marqués, puis nom.</p><div className="championship-table"><table><thead><tr>{['Pos.','Équipe','J','V','N','D','BP','BC','Diff.','Pts'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{c.standings.map(s=><tr key={s.teamId} className={c.teams.find(t=>t.id===s.teamId)?.isOwnTeam ? 'championship-own' : ''}><td>{s.position}</td><th>{teamName(s.teamId)}</th>{[s.played,s.won,s.drawn,s.lost,s.goalsFor,s.goalsAgainst,s.goalDifference,s.points].map((n,i)=><td key={i}>{n}</td>)}</tr>)}</tbody></table></div></section> : <section>
        {data.canManage && <p>Les dates restent facultatives. Déplacez les matchs sans horaire ou utilisez Monter / Descendre. Les journées restent inchangées.</p>}
        {c.byeRounds.length>0 && <details><summary>Journées de repos</summary>{c.byeRounds.map(b=><p key={`${b.round}-${b.teamId}`}>Journée {b.round} : {teamName(b.teamId)}</p>)}</details>}{fixtures.map(f=><article key={f.id} className="championship-fixture" draggable={data.canManage && !busy && !f.kickoffAt} onDragStart={()=>setDrag(f.id)} onDragOver={e=>{if (!f.kickoffAt) e.preventDefault()}} onDrop={e=>{e.preventDefault(); if (drag && !f.kickoffAt && data.canManage && !busy) void mutate(()=>apiPut(`${championshipPath(c.id)}/order`,{revision:c.revision,fixtureIds:reorderUndated(fixtures,drag,f.id)})); setDrag(null)}}>
          <small>Journée {f.round} · {f.leg===2 ? 'Retour' : 'Aller'}</small><strong>{teamName(f.homeTeamId)} — {teamName(f.awayTeamId)}</strong>{!f.kickoffAt && <span className="championship-unscheduled">À programmer</span>}<span>{f.homeScore !== null ? `${f.homeScore} – ${f.awayScore}` : 'À jouer'}</span>
          {data.canManage ? <><form onSubmit={e=>{e.preventDefault(); const input=new FormData(e.currentTarget).get('kickoff') as string; void mutate(()=>apiPatch(`${championshipPath(c.id)}/fixtures/${encodeURIComponent(f.id)}`,{revision:c.revision,kickoffAt:input ? new Date(input).toISOString() : null}))}} key={`${f.id}-${f.kickoffAt}`}><label>Date et heure<input aria-label={`Date et heure ${teamName(f.homeTeamId)} contre ${teamName(f.awayTeamId)}`} type="datetime-local" name="kickoff" defaultValue={localInput(f.kickoffAt)} /></label><button disabled={busy}>Enregistrer l’horaire</button></form>{!f.kickoffAt && <div><button disabled={busy || fixtures.filter(x=>!x.kickoffAt)[0]?.id===f.id} onClick={()=>move(f,-1)}>Monter</button><button disabled={busy || fixtures.filter(x=>!x.kickoffAt).at(-1)?.id===f.id} onClick={()=>move(f,1)}>Descendre</button></div>}{c.status==='VALIDATED' && <form key={`${f.id}-${c.revision}`} onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);const home=String(values.get('home')),away=String(values.get('away')); if (Boolean(home)!==Boolean(away)) {setError('Renseignez les deux scores, ou laissez les deux vides.');return} void mutate(()=>apiPut(`${championshipPath(c.id)}/fixtures/${encodeURIComponent(f.id)}/result`,{revision:c.revision,homeScore:home===''?null:Number(home),awayScore:away===''?null:Number(away)}))}}><label>Score domicile<input type="number" name="home" min="0" max="999" step="1" defaultValue={f.homeScore??''} /></label><label>Score extérieur<input type="number" name="away" min="0" max="999" step="1" defaultValue={f.awayScore??''} /></label><button disabled={busy}>Enregistrer le résultat</button></form>}</> : <time>{f.kickoffAt ? new Date(f.kickoffAt).toLocaleString('fr-FR') : 'À programmer'}</time>}
        </article>)}
        {data.canManage && c.status==='DRAFT' && <div className="championship-validation"><p>{fixtures.filter(f=>!f.kickoffAt).length} rencontre(s) sans horaire : elles resteront à programmer.</p><button disabled={busy} onClick={()=>void mutate(()=>apiPost(`${championshipPath(c.id)}/validate`,{revision:c.revision}))}>Valider le calendrier</button></div>}
      </section>}
    </>}
  </main>
}
