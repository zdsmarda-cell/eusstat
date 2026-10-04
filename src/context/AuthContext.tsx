import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
  clearAuthTokens,
  apiUrl,
} from '../config/api.js';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  login: (u: string, p: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(getAccessToken() || localStorage.getItem('warehouse_auth_token'));
  });

  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('warehouse_auth_user') || (isAuthenticated ? 'eusfhb' : null);
  });

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuthTokens();
      setIsAuthenticated(false);
      setUsername(null);
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, []);

  const login = async (u: string, p: string): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      if (data.success && data.accessToken) {
        setAuthTokens(data.accessToken, data.refreshToken || '', data.user?.username || u);
        setIsAuthenticated(true);
        setUsername(data.user?.username || u);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Chyba přihlášení:', err);
      return false;
    }
  };

  const logout = () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    clearAuthTokens();
    setIsAuthenticated(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
