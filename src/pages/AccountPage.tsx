// src/pages/AccountPage.tsx
import { useAuth } from '../useAuth';

export default function AccountPage() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <div className="page-shell">
      <header className="page-head">
        <h2 className="page-title">Mon compte</h2>
        <p className="page-subtitle">Informations de connexion et rattachements.</p>
      </header>

      <section className="panel" style={{ display: 'grid', gap: 10 }}>
        <div><strong>Email:</strong> {me.email}</div>
        <div><strong>Rôle:</strong> {me.role}</div>
        <div><strong>Club:</strong> {me.clubId || '—'}</div>
        <div><strong>Équipe:</strong> {me.teamId || '—'}</div>
        {me.managedTeamIds.length > 0 && <div><strong>Équipes gérées:</strong> {me.managedTeamIds.join(', ')}</div>}
        {me.linkedPlayerUserId && <div><strong>Joueur lié:</strong> {me.linkedPlayerUserId}</div>}
        <div><strong>Statut:</strong> {me.isPremium ? 'Premium' : 'Gratuit'}</div>
        {typeof me.planningCount === 'number' && <div><strong>Plannings existants:</strong> {me.planningCount}</div>}
      </section>
    </div>
  );
}
