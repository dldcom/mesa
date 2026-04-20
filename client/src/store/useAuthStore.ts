import { create } from 'zustand';
import { api, setToken, clearToken, getToken } from '@/services/api';
import type { Role } from '@shared/types/api';

type User = {
  id: number;
  username: string;
  role: Role;
};

type AuthStore = {
  user: User | null;
  loading: boolean;
  initialized: boolean; // loadMe 가 완료됐는가 (앱 기동 시 토큰 검증용)

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (username, password) => {
    set({ loading: true });
    try {
      const res = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
        auth: false,
      });
      setToken(res.token);
      set({ user: res.user, loading: false, initialized: true });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  logout: () => {
    clearToken();
    set({ user: null });
  },

  loadMe: async () => {
    const token = getToken();
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      const res = await api<{ user: User }>('/api/auth/me');
      set({ user: res.user, initialized: true });
    } catch {
      clearToken();
      set({ user: null, initialized: true });
    }
  },
}));
