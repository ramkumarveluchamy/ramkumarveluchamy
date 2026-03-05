import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('finance_token'));
  const [hasUser, setHasUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/status')
      .then(res => setHasUser(res.data.hasUser))
      .catch(() => setHasUser(false))
      .finally(() => setLoading(false));
  }, []);

  const login = async (pin) => {
    const res = await api.post('/auth/login', { pin });
    localStorage.setItem('finance_token', res.data.token);
    setToken(res.data.token);
    return res.data;
  };

  const setup = async (pin) => {
    const res = await api.post('/auth/setup', { pin });
    localStorage.setItem('finance_token', res.data.token);
    setToken(res.data.token);
    setHasUser(true);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('finance_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, hasUser, loading, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
