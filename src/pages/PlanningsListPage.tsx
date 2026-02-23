// src/pages/PlanningsListPage.tsx
import { useEffect, useState } from 'react';
import { api, type Planning } from '../api';
import { Link, useNavigate } from 'react-router-dom';

export default function PlanningsListPage() {
  const [items, setItems] = useState<Planning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  const load = async () => {
    try {
      setError(null);
      const res = await api.listPlannings();
      setItems(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>Mes plannings</h2>
      <div style={{ margin: '8px 0' }}>
        <button onClick={() => nav('/plannings/new')}>Créer un planning</button>
        <button onClick={load} style={{ marginLeft: 8 }}>Rafraîchir</button>
      </div>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!items ? (
        <div>Chargement…</div>
      ) : items.length === 0 ? (
        <div>Aucun planning pour le moment.</div>
      ) : (
        <ul>
          {items.map(p => (
            <li key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
              <Link to={`/plannings/${p.id}`}>{new Date(p.date).toLocaleDateString()} — {p.id.slice(0, 6)}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
