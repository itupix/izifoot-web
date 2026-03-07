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
  initialTeamLabel?: string
}

const DEFAULT_PLANNING_DATA: PlanningData = {
  start: '10:00',
  pitches: 3,
  matchMin: 10,
  breakMin: 2,
  restEveryX: 3,
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
  initialTeamLabel,
}: PlanningModalProps) {
  const initialData = useMemo<PlanningData>(() => {
    if (planning?.data) return planning.data as PlanningData
    const label = String(initialTeamLabel || '').trim()
    if (!label) return DEFAULT_PLANNING_DATA
    return {
      ...DEFAULT_PLANNING_DATA,
      teams: [{ label, color: '#1d4ed8' }],
    }
  }, [initialTeamLabel, planning?.data])

  const [dataObj, setDataObj] = useState<PlanningData | null>(initialData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorMeta, setEditorMeta] = useState({
    canSave: Boolean(initialData.slots?.length),
    hasGeneratedRotation: Boolean(initialData.slots?.length),
    warnings: [] as string[],
  })

  const isEditing = Boolean(planning)
  const minTeamsWarning = editorMeta.warnings.find((warning) => warning === 'Ajoutez au moins 2 équipes.')

  async function savePlanning() {
    if (!dataObj || !editorMeta.canSave) return
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
            <h3 id="planning-modal-title">Créer une rotation</h3>
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
          value={initialData}
          onChange={setDataObj}
          onMetaChange={setEditorMeta}
        />

        {minTeamsWarning && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#8a5a00', background: '#fff8e1', border: '1px solid #ffecb5', borderRadius: 10, padding: '10px 12px' }}>
            {minTeamsWarning}
          </div>
        )}

        <div className="planning-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
            disabled={!dataObj || saving || !editorMeta.canSave}
            style={{ minHeight: 42, padding: '10px 16px', fontSize: 15 }}
          >
            {saving ? 'Enregistrement…' : isEditing ? 'Enregistrer' : 'Créer la rotation'}
          </CtaButton>
        </div>
      </div>
    </>
  )
}
