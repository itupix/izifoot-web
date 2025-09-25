// src/auth.tsx
import React, { useEffect, useState } from 'react';
import { api, type Me } from './api';
import { AuthCtx } from './useAuth';



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

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
    refresh();
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

  return (
    <AuthCtx.Provider value={{ me, loading, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
};