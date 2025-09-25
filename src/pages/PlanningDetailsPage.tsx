// src/pages/PlanningDetailPage.tsx
import { useEffect, useState } from 'react';
import { api, type Planning } from '../api';
import { useNavigate, useParams } from 'react-router-dom';
import PlanningEditor, { type PlanningData } from '../components/PlanningEditor';

export default function PlanningDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [dataObj, setDataObj] = useState<PlanningData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      setError(null);
      const p = await api.getPlanning(id);
      setPlanning(p);
      // le backend renvoie déjà data en objet -> on le cast
      setDataObj(p.data as PlanningData);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    }
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!id || !dataObj) return;
    try {
      const p = await api.updatePlanning(id, dataObj);
      setPlanning(p);
      alert('Enregistré');
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  const del = async () => {
    if (!id) return;
    if (!confirm('Supprimer ce planning ?')) return;
    try {
      await api.deletePlanning(id);
      nav('/plannings');
    } catch (e: any) {
      alert(e.message || 'Erreur');
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
        <button onClick={load}>Recharger</button>
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