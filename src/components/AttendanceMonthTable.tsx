import { monthLabel, playerName, rateLabel, statusLabels, type AttendancePlayer, type AttendanceStatus, type AttendanceTraining } from '../features/teamAttendance'

const indicators: Record<AttendanceStatus, string> = {
  PRESENT: '', ABSENT: '', NOT_APPLICABLE: '', UNRECORDED: '', UPCOMING: '◷', CANCELLED: '—',
}
const legendLabels: Record<AttendanceStatus, string> = {
  PRESENT: 'Présent', ABSENT: 'Absent', NOT_APPLICABLE: 'Hors effectif à cette date',
  UNRECORDED: 'Non renseigné', UPCOMING: 'À venir', CANCELLED: 'Annulé',
}
function Indicator({ status }: { status: AttendanceStatus }) {
  return <span aria-hidden="true" className={`attendance-indicator attendance-indicator--${status}`}>{indicators[status]}</span>
}
function fullDate(training: AttendanceTraining) {
  return new Date(training.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}
export default function AttendanceMonthTable({ month, trainings, players }: { month: string; trainings: AttendanceTraining[]; players: AttendancePlayer[] }) {
  const columns = trainings.filter((training) => training.month === month).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id))
  const rows = [...players].sort((a, b) => playerName(a).localeCompare(playerName(b), 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
  return <div className="attendance-month-table">
    <ul className="attendance-legend" aria-label="Légende des présences">{(Object.keys(legendLabels) as AttendanceStatus[]).map((status) => <li key={status}><Indicator status={status} />{legendLabels[status]}</li>)}</ul>
    <div className="attendance-table-scroll" role="region" aria-label={`Tableau des présences de ${monthLabel(month)}, défilement horizontal`} tabIndex={0}>
      <table className="attendance-table" style={{ width: 180 + columns.length * 76 + 100 }}>
        <colgroup><col style={{ width: 180 }} />{columns.map((training) => <col key={training.id} style={{ width: 76 }} />)}<col style={{ width: 100 }} /></colgroup>
        <caption className="attendance-sr-only">Présences de {monthLabel(month)} : joueurs par ordre alphabétique et entraînements par date.</caption>
        <thead><tr><th scope="col" className="attendance-name">Joueur</th>{columns.map((training) => <th scope="col" key={training.id}><span className="attendance-sr-only">{fullDate(training)}</span><span aria-hidden="true">{new Date(training.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })}</span></th>)}<th scope="col">Présence<br />du mois</th></tr></thead>
        <tbody>{rows.map((player) => <tr key={player.id}><th scope="row" className="attendance-name">{playerName(player)}</th>{columns.map((training) => {
          const entry = player.attendances.find((attendance) => attendance.trainingId === training.id)
          return <td key={training.id}>{entry ? <><Indicator status={entry.status} /><span className="attendance-sr-only">{playerName(player)}, {fullDate(training)} : {statusLabels[entry.status]}</span></> : <span aria-label={`${playerName(player)}, ${fullDate(training)} : donnée indisponible`}>?</span>}</td>
        })}<td>{rateLabel(player.months.find((item) => item.month === month)?.summary.attendanceRate ?? null)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
}
