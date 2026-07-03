import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import ChatDashboard from './components/ChatDashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if user session already exists in localStorage
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        // Clear corrupt data
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setCheckingAuth(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  if (checkingAuth) {
    return (
      <div className="spinner" style={{ width: '40px', height: '40px' }} />
    );
  }

  return (
    <>
      {!user ? (
        <Auth onAuthSuccess={(loggedUser) => setUser(loggedUser)} />
      ) : (
        <ChatDashboard user={user} onLogout={handleLogout} />
      )}
    </>
  );
}
