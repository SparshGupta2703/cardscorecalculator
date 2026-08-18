import React, { useEffect, useState, useRef } from 'react';
import Peer from 'peerjs';
import { Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react';

export default function VoiceChat({ roomId, playingAs, players }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const peerInstance = useRef(null);
  const myStream = useRef(null);
  const audioRefs = useRef({}); // Stores hidden audio elements in memory

  // Clean up your mic and disconnect if you close the tab
  useEffect(() => {
    return () => {
      if (peerInstance.current) peerInstance.current.destroy();
      if (myStream.current) myStream.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const joinVoice = async () => {
    try {
      // 1. Request Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      myStream.current = stream;
      setIsConnected(true);

      // 2. Connect to the PeerJS Cloud using your exact seat as your "Phone Number"
      const myPeerId = `spades-${roomId}-seat-${playingAs}`;
      
      // ==========================================
      // STUN SERVERS ADDED HERE TO FIX MAC/NAT FIREWALLS
      // ==========================================
      const peer = new Peer(myPeerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
          ]
        }
      });
      peerInstance.current = peer;

      peer.on('open', (id) => {
        console.log('Voice connected! ID: ' + id);
        
        // 3. Immediately dial the other 3 seats at the table
        players.forEach((p, idx) => {
          if (idx !== playingAs && p.socketId) {
            const targetId = `spades-${roomId}-seat-${idx}`;
            const call = peer.call(targetId, stream);
            
            // If they answer, play their audio
            call.on('stream', (remoteStream) => {
              playRemoteStream(idx, remoteStream);
            });
          }
        });
      });

      // 4. If someone joins AFTER you and calls you, answer the phone!
      peer.on('call', (call) => {
        call.answer(stream);
        
        const callerSeat = call.peer.split('-').pop(); // Extracts their seat index
        
        call.on('stream', (remoteStream) => {
          playRemoteStream(callerSeat, remoteStream);
        });
      });

    } catch (err) {
      console.error("Microphone access denied or error:", err);
      alert("Could not access microphone. Ensure you have given permissions.");
    }
  };

  // Attaches incoming audio directly to the browser outside of the React render cycle
  const playRemoteStream = (seatIndex, stream) => {
    if (!audioRefs.current[seatIndex]) {
      const audio = new Audio();
      audio.autoplay = true;
      // ==========================================
      // PLAYSINLINE ADDED HERE TO FIX MAC AUTOPLAY BLOCK
      // ==========================================
      audio.playsInline = true; 
      audioRefs.current[seatIndex] = audio;
    }
    audioRefs.current[seatIndex].srcObject = stream;
  };

  const leaveVoice = () => {
    if (peerInstance.current) peerInstance.current.destroy();
    if (myStream.current) myStream.current.getTracks().forEach(t => t.stop());
    setIsConnected(false);
    audioRefs.current = {};
  };

  const toggleMute = () => {
    if (myStream.current) {
      const audioTrack = myStream.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  // Spectators (ALL) cannot join the voice channel
  if (playingAs === null || playingAs === 'ALL') return null; 

  return (
    <div className="flex items-center gap-2 bg-gray-900/60 p-1.5 rounded-lg border border-gray-700 shadow-inner">
      {!isConnected ? (
        <button onClick={joinVoice} className="btn btn-sm btn-success btn-outline gap-2 text-xs border-success/50 hover:bg-success/20">
          <PhoneCall size={14} /> Join Voice
        </button>
      ) : (
        <>
          <button 
            onClick={toggleMute} 
            className={`btn btn-sm ${isMuted ? 'btn-error' : 'btn-info'} btn-outline gap-2 text-xs`}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />} {isMuted ? 'Muted' : 'Live'}
          </button>
          
          <button onClick={leaveVoice} className="btn btn-sm btn-error btn-outline text-xs px-2 border-error/50" title="Disconnect Voice">
            <PhoneOff size={14} />
          </button>
          
          <div className="flex items-center gap-1.5 px-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isMuted ? 'bg-red-400' : 'bg-green-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isMuted ? 'bg-red-500' : 'bg-green-500'}`}></span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}