import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('casino_token') || null);

  useEffect(() => {
    // If token exists, load user data from local storage
    if (token) {
      const storedUser = localStorage.getItem('casino_user');
      if (storedUser) setUser(JSON.parse(storedUser));
    }
  }, [token]);

  const login = (userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem('casino_token', jwtToken);
    localStorage.setItem('casino_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('casino_token');
    localStorage.removeItem('casino_user');
  };

  return (

    
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};