import axios from 'axios';
import { STORAGE_KEYS } from '../utils/constants.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: false,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      const onLoginPage = window.location.pathname.startsWith('/login');
      if (!onLoginPage) {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  },
);

export default api;
