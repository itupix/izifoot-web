// src/auth.tsx
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, type Me } from './api';
import { canManageClub, canWrite, isReadOnlyRole } from './authz';
import { AuthCtx } from './useAuth';



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const isPublicPlateauRoute = location.pathname.startsWith('/plateau/public/');

  const refresh = async () => {
    try {
      const u = await api.me();
      setMe(u);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPublicPlateauRoute) {
      setLoading(false);
      return;
    }
    refresh();
  }, [isPublicPlateauRoute]);

  useEffect(() => {
    const onUnauthorized = () => {
      setMe(null);
      setLoading(false);
    };
    window.addEventListener('izifoot:unauthorized', onUnauthorized);
    return () => window.removeEventListener('izifoot:unauthorized', onUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const u = await api.login(email, password);
      setMe(u);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    try {
      const u = await api.register(email, password);
      setMe(u);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.logout();
    setMe(null);
  };

  const role = me?.role ?? null;
  const isDirection = role === 'DIRECTION';
  const isCoach = role === 'COACH';
  const isPlayerOrParent = role ? isReadOnlyRole(role) : false;

  return (
    <AuthCtx.Provider
      value={{
        me,
        loading,
        role,
        isDirection,
        isCoach,
        isPlayerOrParent,
        canWrite: role ? canWrite(role) : false,
        canManageClub: role ? canManageClub(role) : false,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
};
