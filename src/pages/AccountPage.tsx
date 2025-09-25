// src/pages/AccountPage.tsx
import { useAuth } from '../useAuth';

export default function AccountPage() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <div>
      <h2>Mon compte</h2>
      <p><strong>Email :</strong> {me.email}</p>
      <p><strong>Statut :</strong> {me.isPremium ? 'Premium' : 'Gratuit'}</p>
      {typeof me.planningCount === 'number' && (
        <p><strong>Plannings existants :</strong> {me.planningCount}</p>
      )}
    </div>
  );
}