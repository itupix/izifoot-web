// src/pages/AccountPage.tsx
import { useEffect, useState } from 'react';
import { apiPut } from '../apiClient';
import { apiRoutes } from '../apiRoutes';
import { toErrorMessage } from '../errors';
import { uiAlert } from '../ui';
import { useAuth } from '../useAuth';

export default function AccountPage() {
  const { me, refresh } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName || '');
    setLastName(me.lastName || '');
    setEmail(me.email || '');
    setPhone(me.phone || '');
  }, [me]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!me) return;

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim();
    const normalizedPhone = phone.trim();

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !normalizedPhone) {
      uiAlert('Merci de renseigner prénom, nom, e-mail et téléphone.');
      return;
    }

    setSaving(true);
    try {
      await apiPut(apiRoutes.meProfile, {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        email: normalizedEmail,
        phone: normalizedPhone,
      });
      await refresh();
      uiAlert('Profil mis à jour.');
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour profil: ${toErrorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  }

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

      <section className="panel">
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Modifier mon profil</h3>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Prénom</span>
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Nom</span>
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Téléphone</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
