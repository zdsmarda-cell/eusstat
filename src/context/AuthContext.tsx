import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  login: (u: string, p: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('warehouse_auth_token') === 'authenticated_eusfhb_353';
  });

  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('warehouse_auth_user') || (isAuthenticated ? 'eusfhb' : null);
  });

  const login = (u: string, p: string): boolean => {
    // Hardcoded credentials requirement
    if (u.trim() === 'eusfhb' && p === 'Master353') {
      localStorage.setItem('warehouse_auth_token', 'authenticated_eusfhb_353');
      localStorage.setItem('warehouse_auth_user', 'eusfhb');
      setIsAuthenticated(true);
      setUsername('eusfhb');
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('warehouse_auth_token');
    localStorage.removeItem('warehouse_auth_user');
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
