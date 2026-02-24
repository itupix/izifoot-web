// src/pages/CreatePlanningPage.tsx
import React, { useState } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import PlanningEditor, { type PlanningData } from '../components/PlanningEditor';
import { toErrorMessage } from '../errors';

export default function CreatePlanningPage() {
  const nav = useNavigate();
  const [date, setDate] = useState<string>('');
  const [dataObj, setDataObj] = useState<PlanningData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!date) { setError('Choisis une date.'); return; }
    if (!dataObj) { setError('Le planning est vide.'); return; }
    try {
      setSaving(true);
      const dateISO = new Date(date).toISOString();
      const p = await api.createPlanning(dateISO, dataObj);
      nav(`/plannings/${p.id}`);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2>Nouveau planning</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />
        </label>
        <div>
          <button type="submit" disabled={!date || !dataObj || saving}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>

      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}

      {/* Éditeur visuel : produit le JSON final via onChange */}
      <PlanningEditor
        value={{
          start: '10:00',
          pitches: 3,
          matchMin: 10,
          breakMin: 2,
          slots: [],
        }}
        onChange={setDataObj}
        title="Préparer le planning"
      />
    </div>
  );
}
