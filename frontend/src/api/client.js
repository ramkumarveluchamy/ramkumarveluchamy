import axios from 'axios';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // e.g. '/finance' or ''

const api = axios.create({ baseURL: `${BASE}/api` });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('finance_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('finance_token');
      window.location.href = `${BASE}/login`;
    }
    return Promise.reject(err);
  }
);

export default api;
