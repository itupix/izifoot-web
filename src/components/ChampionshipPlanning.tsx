import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../apiClient'
import type { ChampionshipResponse } from '../features/championship'
import '../pages/ChampionshipPage.css'

export default function ChampionshipPlanning({teamId, dayKey, onDates}: {teamId: string | null; dayKey: string; onDates: (dates: string[]) => void}) {
  const [data,setData]=useState<ChampionshipResponse | null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false;setData(null);setError('');onDates([])
    if(teamId) apiGet<ChampionshipResponse>(`/championship?teamId=${encodeURIComponent(teamId)}`).then(result=>{if(!cancelled){setData(result);const championship=result.championship;const own=championship?.teams.find(team=>team.isOwnTeam)?.id;onDates(championship?.status==='VALIDATED' ? championship.fixtures.filter(f=>(f.homeTeamId===own || f.awayTeamId===own) && f.kickoffAt).map(f=>f.kickoffAt as string) : [])}}).catch(()=>{if(!cancelled)setError('Les rencontres du championnat n’ont pas pu être chargées.')})
    return ()=>{cancelled=true}
  },[teamId,onDates])
  const c=data?.championship
  if(error) return <p role="alert">{error}</p>
  if(!c || c.status!=='VALIDATED')return null
  const own=c.teams.find(t=>t.isOwnTeam)?.id
  const fixtures=c.fixtures.filter(f=>f.homeTeamId===own || f.awayTeamId===own).sort((a,b)=>a.order-b.order)
  const key=(iso:string)=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  const dated=fixtures.filter(f=>f.kickoffAt && key(f.kickoffAt)===dayKey)
  const undated=fixtures.filter(f=>!f.kickoffAt)
  const name=(id:string)=>c.teams.find(t=>t.id===id)?.name || 'Équipe'
  return <>{[{title:'Championnat',items:dated},{title:'À programmer',items:undated}].filter(group=>group.items.length>0).map(group=><section className="championship-planning" key={group.title}><h2>{group.title}</h2>{group.items.map(f=><p key={f.id}><Link to="/championship">{name(f.homeTeamId)} — {name(f.awayTeamId)}</Link> · Journée {f.round}{f.kickoffAt && <> · {new Date(f.kickoffAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</>}</p>)}</section>)}</>
}
