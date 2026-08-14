import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Spade, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuthPage() {
  const { login } = useContext(AuthContext);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
  // Hard-code the fallback so it never resolves to "undefined"
const API_URL = import.meta.env.VITE_API_URL ;
const endpoint = isLogin ? `${API_URL}/auth/login` : `${API_URL}/auth/register`;

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    if (!isLogin && file) formData.append('pfp', file);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: isLogin ? { 'Content-Type': 'application/json' } : {},
        body: isLogin ? JSON.stringify({ username, password }) : formData
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      if (isLogin) {
        login(data.user, data.token);
        toast.success(`Welcome back, ${data.user.username}!`);
      } else {
        toast.success("Registered! You can now log in.");
        setIsLogin(true);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lobby-container animate-pop">
      <h1><Spade className="inline-icon" size={32} /> Spades Casino</h1>
      <div className="lobby-panel" style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h2>{isLogin ? 'Login to your account' : 'Create an account'}</h2>
        <form onSubmit={handleSubmit} className="create-form">
          <input type="text" placeholder="Username" value={username} onChange={(e)=>setUsername(e.target.value)} className="lobby-input" required />
          <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} className="lobby-input" required />
          
          {!isLogin && (
            <div style={{ marginBottom: '16px' }}>
              <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                <Camera size={16} className="inline-icon" /> {file ? 'Selfie Selected' : 'Upload Selfie (Optional)'}
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} style={{ display: 'none' }} />
              </label>
              <small style={{ color: '#94a3b8', display: 'block', marginTop: '8px' }}>We will use AI to turn this into your royal cards!</small>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '16px', cursor: 'pointer', color: '#38bdf8' }} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'Need an account? Register' : 'Already have an account? Login'}
        </p>
      </div>
    </div>
  );
}