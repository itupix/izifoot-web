import { useMemo, useState } from 'react'
import { api, type Planning } from '../api'
import { toErrorMessage } from '../errors'
import CtaButton from './CtaButton'
import PlanningEditor, { type PlanningData } from './PlanningEditor'

type PlanningModalProps = {
  dateISO: string
  planning?: Planning | null
  onClose: () => void
  onSaved: (planning: Planning) => void
}

const DEFAULT_PLANNING_DATA: PlanningData = {
  start: '10:00',
  pitches: 3,
  matchMin: 10,
  breakMin: 2,
  slots: [],
}

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 999,
  background: '#fff',
  color: '#334155',
  padding: '10px 14px',
  fontWeight: 700,
}

export default function PlanningModal({
  dateISO,
  planning,
  onClose,
  onSaved,
}: PlanningModalProps) {
  const [dataObj, setDataObj] = useState<PlanningData | null>((planning?.data as PlanningData) ?? DEFAULT_PLANNING_DATA)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = Boolean(planning)
  const dateLabel = useMemo(() => {
    if (!dateISO) return ''
    return new Date(dateISO).toLocaleDateString()
  }, [dateISO])

  async function savePlanning() {
    if (!dataObj) return
    setError(null)
    setSaving(true)
    try {
      const saved = planning
        ? await api.updatePlanning(planning.id, dataObj)
        : await api.createPlanning(dateISO, dataObj)
      onSaved(saved)
      onClose()
    } catch (err: unknown) {
      setError(toErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (saving) return
    onClose()
  }

  return (
    <>
      <div className="modal-overlay" onClick={handleClose} />
      <div className="drill-modal planning-modal" role="dialog" aria-modal="true" aria-labelledby="planning-modal-title">
        <div className="drill-modal-head">
          <div>
            <h3 id="planning-modal-title">{isEditing ? 'Modifier la rotation' : 'Créer une rotation'}</h3>
            <p>{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '1px solid #dbe5f1',
              background: '#f8fafc',
              color: '#334155',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        <PlanningEditor
          key={planning?.id ?? `new-${dateISO}`}
          value={(planning?.data as PlanningData) ?? DEFAULT_PLANNING_DATA}
          onChange={setDataObj}
          title="Préparer la rotation"
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={secondaryButtonStyle}
          >
            Annuler
          </button>
          <CtaButton
            type="button"
            onClick={() => void savePlanning()}
            disabled={!dataObj || saving}
            style={{ minHeight: 42, padding: '10px 16px', fontSize: 15 }}
          >
            {saving ? 'Enregistrement…' : isEditing ? 'Enregistrer' : 'Créer la rotation'}
          </CtaButton>
        </div>
      </div>
    </>
  )
}
