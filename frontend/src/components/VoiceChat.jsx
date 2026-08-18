import React, { useEffect, useState, useRef } from 'react';
import Peer from 'peerjs';
import { Mic, MicOff, PhoneCall, PhoneOff, Settings, X, Play, Activity } from 'lucide-react';

export default function VoiceChat({ roomId, playingAs, players }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Settings & Devices State
  const [showConfig, setShowConfig] = useState(false);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  
  const [speakingSeats, setSpeakingSeats] = useState({});

  // Testing States
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testVolume, setTestVolume] = useState(0);

  const peerInstance = useRef(null);
  const myStream = useRef(null);
  const audioRefs = useRef([]); 
  const audioContextRef = useRef(null);
  const analyserRefs = useRef({});

  // Testing Refs
  const testMicStreamRef = useRef(null);
  const testMicAudioCtxRef = useRef(null);
  const testMicAnimFrameRef = useRef(null);
  const testAudioRef = useRef(null);

  const fetchDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter(d => d.kind === 'audioinput'));
      setSpeakers(devices.filter(d => d.kind === 'audiooutput'));
      
      if (!selectedMic) setSelectedMic(devices.find(d => d.kind === 'audioinput')?.deviceId || '');
      if (!selectedSpeaker) setSelectedSpeaker(devices.find(d => d.kind === 'audiooutput')?.deviceId || '');
    } catch (err) {
      console.error("Could not enumerate devices:", err);
    }
  };

  useEffect(() => {
    fetchDevices();
    return () => {
      leaveVoice();
      stopMicTest();
    };
  }, []);

  // Stop test when modal is closed
  useEffect(() => {
    if (!showConfig) stopMicTest();
  }, [showConfig]);

  // ==========================================
  // HARDWARE TESTING LOGIC
  // ==========================================
  const toggleMicTest = async () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true
        });
        testMicStreamRef.current = stream;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        testMicAudioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVol = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          
          // Convert to a 0-100 percentage for the volume bar
          setTestVolume(Math.min(100, Math.round(avg * 1.5))); 
          testMicAnimFrameRef.current = requestAnimationFrame(checkVol);
        };
        checkVol();
        setIsTestingMic(true);
      } catch (err) {
        console.error("Test mic failed:", err);
      }
    }
  };

  const stopMicTest = () => {
    if (testMicStreamRef.current) testMicStreamRef.current.getTracks().forEach(t => t.stop());
    if (testMicAudioCtxRef.current) testMicAudioCtxRef.current.close();
    cancelAnimationFrame(testMicAnimFrameRef.current);
    setIsTestingMic(false);
    setTestVolume(0);
  };

  const playSpeakerTest = async () => {
    if (testAudioRef.current) {
      try {
        if (selectedSpeaker && typeof testAudioRef.current.setSinkId === 'function') {
          await testAudioRef.current.setSinkId(selectedSpeaker);
        }
        testAudioRef.current.currentTime = 0;
        testAudioRef.current.play();
      } catch (err) {
        console.error("Speaker test failed:", err);
      }
    }
  };
  // ==========================================

  const monitorSpeaking = (seatIndex, stream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const audioCtx = audioContextRef.current;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.1;
    
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyserRefs.current[seatIndex] = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const checkVolume = () => {
      if (!analyserRefs.current[seatIndex]) return;
      analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;

      setSpeakingSeats(prev => ({ ...prev, [seatIndex]: average > 25 }));
      requestAnimationFrame(checkVolume);
    };
    checkVolume();
  };

  const joinVoice = async () => {
    try {
      const constraints = {
        audio: selectedMic ? { deviceId: { exact: selectedMic }, echoCancellation: true, noiseSuppression: true } : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      myStream.current = stream;
      setIsConnected(true);
      
      monitorSpeaking(playingAs, stream);

      const myPeerId = `spades-${roomId}-seat-${playingAs}`;
      const peer = new Peer(myPeerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ]
        }
      });
      peerInstance.current = peer;

      peer.on('open', (id) => {
        players.forEach((p, idx) => {
          if (idx !== playingAs && p.socketId) {
            const targetId = `spades-${roomId}-seat-${idx}`;
            const call = peer.call(targetId, stream);
            call.on('stream', (remoteStream) => attachAudio(idx, remoteStream));
          }
        });
      });

      peer.on('call', (call) => {
        call.answer(stream);
        const callerSeat = call.peer.split('-').pop();
        call.on('stream', (remoteStream) => attachAudio(callerSeat, remoteStream));
      });

    } catch (err) {
      console.error("Voice Error:", err);
      alert("Could not start voice chat. Check permissions.");
    }
  };

  const attachAudio = async (seatIndex, stream) => {
    const audioElement = audioRefs.current[seatIndex];
    if (audioElement) {
      audioElement.srcObject = stream;
      
      if (selectedSpeaker && typeof audioElement.setSinkId === 'function') {
        try {
          await audioElement.setSinkId(selectedSpeaker);
        } catch (e) { console.warn("Browser doesn't support changing speakers"); }
      }
      
      monitorSpeaking(seatIndex, stream);
    }
  };

  const leaveVoice = () => {
    if (peerInstance.current) peerInstance.current.destroy();
    if (myStream.current) myStream.current.getTracks().forEach(t => t.stop());
    setIsConnected(false);
    setSpeakingSeats({});
    analyserRefs.current = {};
    if (audioContextRef.current) audioContextRef.current.close();
    audioContextRef.current = null;
  };

  const toggleMute = () => {
    if (myStream.current) {
      const audioTrack = myStream.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  if (playingAs === null || playingAs === 'ALL') return null;

  return (
    <div className="flex flex-col gap-2 relative">
      
      {/* VOICE CONTROLS */}
      <div className="flex items-center gap-2 bg-gray-900/80 p-1.5 rounded-lg border border-gray-700">
        {!isConnected ? (
          <button onClick={joinVoice} className="btn btn-sm btn-success btn-outline gap-2 text-xs">
            <PhoneCall size={14} /> Join Voice
          </button>
        ) : (
          <>
            <button onClick={toggleMute} className={`btn btn-sm ${isMuted ? 'btn-error' : 'btn-info'} btn-outline gap-2 text-xs`}>
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />} {isMuted ? 'Muted' : 'Live'}
            </button>
            <button onClick={leaveVoice} className="btn btn-sm btn-error btn-outline px-2" title="Disconnect">
              <PhoneOff size={14} />
            </button>
          </>
        )}
        
        <button onClick={() => setShowConfig(true)} className="btn btn-sm btn-ghost px-2 text-gray-400 hover:text-white">
          <Settings size={16} />
        </button>
      </div>

      {/* ACTIVE SPEAKER AVATARS */}
      {isConnected && (
        <div className="flex gap-2 px-1">
          {players.map((p, idx) => {
             const isTalking = speakingSeats[idx] && (!isMuted || idx !== playingAs);
             
             if (idx !== playingAs && !analyserRefs.current[idx]) return null;

             // Bulletproof Cloudinary / Image Checks
             const playerName = p.name || p.username || p.displayName || `Seat ${idx + 1}`;
             const playerDP =p.pfp || p.cloudinaryUrl || p.avatarUrl || p.avatar || p.profilePic || p.image;

             return (
               <div 
                 key={idx} 
                 className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all duration-200 shadow-lg ${
                   isTalking ? 'border-green-400 opacity-100 scale-110 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'border-gray-600 opacity-40'
                 }`}
                 title={playerName}
               >
                 {playerDP ? (
                   // Displays the Cloudinary String automatically
                   <img src={playerDP} alt={playerName} className="w-full h-full object-cover" />
                 ) : (
                   // UI-Avatars Fallback API
                   <img 
                     src={`https://ui-avatars.com/api/?name=${playerName}&background=0369a1&color=fff&bold=true`} 
                     alt={playerName} 
                     className="w-full h-full object-cover" 
                   />
                 )}
               </div>
             );
          })}
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showConfig && (
        <div className="absolute top-12 left-0 z-50 w-72 bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-sm">Audio Settings</h3>
            <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-white"><X size={16}/></button>
          </div>
          
          <div className="space-y-4">
            {/* MIC SECTION */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Microphone</label>
              <div className="flex gap-2 mb-2">
                <select 
                  value={selectedMic} 
                  onChange={(e) => {
                    setSelectedMic(e.target.value);
                    stopMicTest();
                  }}
                  className="flex-1 bg-gray-900 text-white text-xs p-2 rounded border border-gray-700 w-full"
                >
                  {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Default Mic'}</option>)}
                </select>
                <button 
                  onClick={toggleMicTest}
                  className={`btn btn-sm btn-outline text-xs px-2 ${isTestingMic ? 'btn-error' : 'btn-info'}`}
                  title="Test Microphone"
                >
                  <Activity size={14} />
                </button>
              </div>
              
              {/* LIVE MIC METER */}
              {isTestingMic && (
                <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-700">
                  <div 
                    className="h-full bg-green-500 transition-all duration-75"
                    style={{ width: `${testVolume}%` }}
                  />
                </div>
              )}
            </div>
            
            {/* SPEAKER SECTION */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Speaker (Output)</label>
              <div className="flex gap-2">
                <select 
                  value={selectedSpeaker} 
                  onChange={(e) => setSelectedSpeaker(e.target.value)}
                  className="flex-1 min-w-0 w-full truncate bg-gray-900 text-white text-xs p-2 rounded border border-gray-700"
                >
                  {speakers.map(s => <option key={s.deviceId} value={s.deviceId}>{s.label || 'System Default'}</option>)}
                </select>
                <button 
                  onClick={playSpeakerTest}
                  className="btn btn-sm btn-success btn-outline text-xs px-2 shrink-0"
                  title="Test Speaker"
                >
                  <Play size={14} />
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-700">
              <button onClick={fetchDevices} className="w-full btn btn-sm btn-outline text-xs border-gray-600 text-gray-300">
                Refresh Devices
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN DOM AUDIO ELEMENTS */}
      <div style={{ display: 'none' }}>
        {players.map((_, idx) => (
          <audio key={idx} ref={el => audioRefs.current[idx] = el} autoPlay playsInline />
        ))}
        {/* Short Ping Sound for Speaker Test */}
        <audio 
          ref={testAudioRef} 
          src="https://actions.google.com/sounds/v1/alarms/beep_short.ogg" 
          playsInline
        />
      </div>
    </div>
  );
}