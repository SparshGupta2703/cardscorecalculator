import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PlayingCard from '../components/PlayingCard';
import { Camera, ArrowLeft, User as UserIcon } from 'lucide-react';

export default function ProfilePage() {
  const { user, token, login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSuit, setSelectedSuit] = useState('spades'); // Toggle state

  const handleUpdatePfp = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading('Uploading and generating AI royal cards...');

    const formData = new FormData();
    formData.append('username', user.username);
    formData.append('pfp', file);

    try {
      const API_URL = import.meta.env.VITE_API_URL;
      const res = await fetch(`${API_URL}/auth/update-pfp`, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Re-trigger the login context function to overwrite local storage with the new PFP/Cards
      login(data.user, token);
      toast.success('Profile and Deck Updated!', { id: toastId });
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Generate a mock hand of just the Royal Cards for the preview grid
  const previewCards = [
    { id: 'j', suit: selectedSuit, rank: 11 },
    { id: 'q', suit: selectedSuit, rank: 12 },
    { id: 'k', suit: selectedSuit, rank: 13 },
    { id: 'a', suit: selectedSuit, rank: 14 }
  ];

  return (
    <div className="max-w-4xl mx-auto mt-10 p-4 animate-pop">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 bg-base-300 p-4 rounded-xl shadow-lg border border-base-content/10">
        <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm gap-2">
          <ArrowLeft size={16} /> Back to Lobby
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-primary">
          <UserIcon size={24} /> My Casino Profile
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: AVATAR & UPLOAD */}
        <div className="col-span-1 bg-base-200 p-6 rounded-2xl shadow-xl border border-base-content/5 flex flex-col items-center text-center">
          <div className="avatar mb-4">
            <div className="w-32 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
              <img src={user?.pfp || 'https://via.placeholder.com/150'} alt="Profile" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-base-content mb-1">{user?.username}</h2>
          <p className="text-base-content/50 text-sm mb-6">VIP Casino Member</p>

          <label className={`btn btn-secondary w-full ${isUploading ? 'loading' : ''}`}>
            {!isUploading && <Camera size={18} />} 
            {isUploading ? 'Generating...' : 'Update Portrait'}
            <input type="file" accept="image/*" onChange={handleUpdatePfp} className="hidden" disabled={isUploading} />
          </label>
        </div>

        {/* RIGHT COLUMN: CARD PREVIEW */}
        <div className="col-span-1 md:col-span-2 bg-base-200 p-6 rounded-2xl shadow-xl border border-base-content/5">
          <h3 className="text-xl font-bold mb-4">My Custom Deck</h3>
          
          {/* SUIT TOGGLE (DAISY UI TABS) */}
          <div className="tabs tabs-boxed mb-6 justify-center bg-base-300">
            {['spades', 'hearts', 'clubs', 'diamonds'].map(suit => (
              <button 
                key={suit}
                className={`tab tab-lg font-bold ${selectedSuit === suit ? 'tab-active text-primary' : ''}`}
                onClick={() => setSelectedSuit(suit)}
                style={{ textTransform: 'capitalize' }}
              >
                {suit}
              </button>
            ))}
          </div>

          {/* CARD GRID */}
          <div className="flex flex-wrap justify-center gap-6">
            {!user?.cardFaces || !user.cardFaces[11] ? (
              <p className="text-base-content/50 italic py-10">Upload a portrait to generate your custom cards.</p>
            ) : (
              previewCards.map(card => (
                <div key={card.id} className="flex flex-col items-center">
                  <PlayingCard 
                    card={card} 
                    faceDown={false} 
                    isPlayable={false} 
                    customFaceMap={user.cardFaces} 
                  />
                  <span className="mt-3 text-sm font-bold text-base-content/70">
                    {card.rank === 11 ? 'Jack' : card.rank === 12 ? 'Queen' : card.rank === 13 ? 'King' : 'Ace'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}