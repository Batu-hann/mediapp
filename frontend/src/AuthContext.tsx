import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, TOKEN_KEY, USER_KEY } from './api';
import type { Lang } from './i18n';

export type User = {
  id: string;
  name: string;
  surname: string;
  email: string;
  date_of_birth: string;
  phone_number: string;
  language: Lang;
  dark_mode: boolean;
  notifications_enabled: boolean;
  created_at: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  language: Lang;
  setLanguage: (l: Lang) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<Lang>('tr');

  const setLanguage = async (l: Lang) => {
    setLanguageState(l);
    await AsyncStorage.setItem('mediassist_lang', l);
  };

  const setUser = (u: User) => {
    setUserState(u);
    AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    if (u.language) setLanguageState(u.language);
  };

  useEffect(() => {
    (async () => {
      try {
        const [token, userStr, lang] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem('mediassist_lang'),
        ]);
        if (lang === 'tr' || lang === 'en') setLanguageState(lang);
        if (token && userStr) {
          const u = JSON.parse(userStr) as User;
          setUserState(u);
          if (u.language) setLanguageState(u.language);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem(TOKEN_KEY, res.data.access_token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    setUserState(res.data.user);
    if (res.data.user.language) setLanguageState(res.data.user.language);
  };

  const register = async (data: any) => {
    const res = await api.post('/auth/register', data);
    await AsyncStorage.setItem(TOKEN_KEY, res.data.access_token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    setUserState(res.data.user);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setUserState(null);
  };

  const refresh = async () => {
    try {
      const res = await api.get('/auth/me');
      setUserState(res.data);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.data));
      if (res.data.language) setLanguageState(res.data.language);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, language, setLanguage, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
