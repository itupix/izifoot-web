// src/pages/AccountPage.tsx
import { useAuth } from '../useAuth';

export default function AccountPage() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <div>
      <h2>Mon compte</h2>
      <p><strong>Email :</strong> {me.email}</p>
      <p><strong>Rôle :</strong> {me.role}</p>
      <p><strong>Club :</strong> {me.clubId || '—'}</p>
      <p><strong>Équipe :</strong> {me.teamId || '—'}</p>
      {me.managedTeamIds.length > 0 && (
        <p><strong>Équipes gérées :</strong> {me.managedTeamIds.join(', ')}</p>
      )}
      {me.linkedPlayerUserId && (
        <p><strong>Joueur lié :</strong> {me.linkedPlayerUserId}</p>
      )}
      <p><strong>Statut :</strong> {me.isPremium ? 'Premium' : 'Gratuit'}</p>
      {typeof me.planningCount === 'number' && (
        <p><strong>Plannings existants :</strong> {me.planningCount}</p>
      )}
    </div>
  );
}
