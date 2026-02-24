// src/pages/PlanningDetailPage.tsx
import { useState } from 'react';
import { api, type Planning } from '../api';
import { useNavigate, useParams } from 'react-router-dom';
import PlanningEditor, { type PlanningData } from '../components/PlanningEditor';
import { toErrorMessage } from '../errors';
import { useAsyncLoader } from '../hooks/useAsyncLoader';
import { uiAlert, uiConfirm } from '../ui';

export default function PlanningDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [dataObj, setDataObj] = useState<PlanningData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { error } = useAsyncLoader(async ({ isCancelled }) => {
    if (!id) return;
    const p = await api.getPlanning(id);
    if (isCancelled()) return;
    setPlanning(p);
    // le backend renvoie déjà data en objet -> on le cast
    setDataObj(p.data as PlanningData);
  }, [id, reloadToken]);

  const save = async () => {
    if (!id || !dataObj) return;
    try {
      const p = await api.updatePlanning(id, dataObj);
      setPlanning(p);
      uiAlert('Enregistré');
    } catch (err: unknown) {
      uiAlert(toErrorMessage(err));
    }
  };

  const del = async () => {
    if (!id) return;
    if (!uiConfirm('Supprimer ce planning ?')) return;
    try {
      await api.deletePlanning(id);
      nav('/plannings');
    } catch (err: unknown) {
      uiAlert(toErrorMessage(err));
    }
  };

  if (!id) return <div>Id manquant</div>;

  return (
    <div>
      <h2>Planning</h2>
      {planning && (
        <p>
          <strong>Date :</strong> {new Date(planning.date).toLocaleDateString()}<br />
          <strong>Créé le :</strong> {new Date(planning.createdAt).toLocaleString()}
        </p>
      )}

      <div style={{ margin: '8px 0', display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={!dataObj}>Enregistrer</button>
        <button onClick={del} style={{ background: '#eee' }}>Supprimer</button>
        <button onClick={() => setReloadToken(x => x + 1)}>Recharger</button>
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {/* >>>>>>> ICI : l’éditeur visuel remplace le textarea JSON <<<<<<< */}
      <PlanningEditor
        value={dataObj ?? undefined}
        onChange={setDataObj}
        title="Éditeur de planning izifoot"
      />
    </div>
  );
}
