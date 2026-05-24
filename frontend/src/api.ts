import { create } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEFAULT_BACKEND_URL = Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://localhost:8000',
}) ?? 'http://localhost:8000';

const envBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
export const BACKEND_URL = (envBackendUrl && envBackendUrl !== 'undefined'
  ? envBackendUrl
  : DEFAULT_BACKEND_URL
).replace(/\/$/, '');

export const API_BASE = `${BACKEND_URL}/api`;

export const TOKEN_KEY = 'mediassist_token';
export const USER_KEY = 'mediassist_user';

export const api = create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    }
    return Promise.reject(err);
  }
);
