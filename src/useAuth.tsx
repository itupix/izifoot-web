import { createContext, useContext } from "react";
import type { Me } from "./api";
import type { AccountRole } from "./authz";

type AuthState = {
  me: Me | null;
  loading: boolean;
  role: AccountRole | null;
  isDirection: boolean;
  isCoach: boolean;
  isPlayerOrParent: boolean;
  canWrite: boolean;
  canManageClub: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, clubName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthCtx = createContext<AuthState | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
};
