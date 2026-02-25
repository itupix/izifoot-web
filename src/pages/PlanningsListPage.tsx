// src/pages/PlanningsListPage.tsx
import { useState } from 'react';
import { api, type Planning } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { useAsyncLoader } from '../hooks/useAsyncLoader';
import CtaButton from '../components/CtaButton';

export default function PlanningsListPage() {
  const [items, setItems] = useState<Planning[] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const nav = useNavigate();

  const { error } = useAsyncLoader(async ({ isCancelled }) => {
    const res = await api.listPlannings();
    if (!isCancelled()) setItems(res);
  }, [reloadToken]);

  return (
    <div>
      <h2>Mes plannings</h2>
      <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <CtaButton onClick={() => nav('/plannings/new')}>Créer un planning</CtaButton>
        <button onClick={() => setReloadToken(x => x + 1)}>Rafraîchir</button>
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
