import React, { useState, useRef, useEffect, useMemo } from 'react';
import Draggable from 'react-draggable';
import { 
  Play, Pause, Volume2, Music, GripHorizontal, 
  Maximize2, Minimize2, ListMusic, SkipBack, SkipForward, 
  Rewind, FastForward 
} from 'lucide-react';
import { socket } from '../socket/socketClient';

// Extracts Video ID, Playlist ID, and Track Index
const parseYouTubeUrl = (url) => {
  if (!url) return { videoId: 'LXb3EKWsInQ', listId: null, index: 0 };
  
  const listMatch = url.match(/[?&]list=([^#\&\?]+)/);
  const videoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  const indexMatch = url.match(/[?&]index=(\d+)/);

  return {
    videoId: videoMatch ? videoMatch[1] : (listMatch ? '' : 'LXb3EKWsInQ'),
    listId: listMatch ? listMatch[1] : null,
    index: indexMatch ? parseInt(indexMatch[1]) - 1 : 0 
  };
};

export default function DJBooth({ roomId, musicState }) {
  const nodeRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  
  const prevUrlRef = useRef('');
  const currentListIdRef = useRef(null); // CRITICAL FIX: Tracks the loaded playlist

  const [isReady, setIsReady] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [volume, setVolume] = useState(50); 
  
  const [playlistIds, setPlaylistIds] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [trackNames, setTrackNames] = useState({});

  const rawUrl = musicState?.url || '';
  const isPlaying = musicState?.isPlaying || false;
  const playedSeconds = musicState?.playedSeconds || 0;
  
  const ytData = useMemo(() => parseYouTubeUrl(rawUrl), [rawUrl]);

  // 1. Initialize Player
  useEffect(() => {
    let isSubscribed = true;

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player || !playerContainerRef.current) return;
      if (playerRef.current) return; 

      const playerVars = { 
        playsinline: 1, 
        controls: 0, 
        disablekb: 1, 
        rel: 0, 
        modestbranding: 1 
      };
      
      if (ytData.listId) {
        playerVars.listType = 'playlist';
        playerVars.list = ytData.listId;
        currentListIdRef.current = ytData.listId;
      }

      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        height: '100%',
        width: '100%',
        videoId: ytData.videoId || undefined,
        playerVars,
        events: {
          onReady: (event) => {
            if (!isSubscribed) return;
            setIsReady(true);
            event.target.setVolume(volume);
            if (isPlaying) event.target.playVideo();
          },
          onStateChange: (event) => {
            if (!isSubscribed) return;
            if (event.target.getPlaylist) {
              const list = event.target.getPlaylist();
              if (list && list.length > 0) {
                setPlaylistIds(list);
                const activeIdx = event.target.getPlaylistIndex();
                
                // CRITICAL FIX: Ignore -1 during transitions to prevent the "Same Song" loop bug!
                if (activeIdx !== -1) {
                  setCurrentTrackIndex(activeIdx);
                }
              } else {
                setPlaylistIds([]);
              }
            }
          },
          onError: (e) => console.error('YouTube Player Error:', e.data)
        }
      });
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      window.onYouTubeIframeAPIReady = initializePlayer;
      document.body.appendChild(tag);
    } else {
      initializePlayer();
    }

    return () => { isSubscribed = false; };
  }, []); 

  // 2. Handle URL / Playlist Changes
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    
    if (rawUrl !== prevUrlRef.current) {
      prevUrlRef.current = rawUrl;
      try {
        if (ytData.listId) {
          // CRITICAL FIX: If the playlist is ALREADY loaded, just jump to the track!
          // This prevents dynamic playlists/mixes from randomly reshuffling on every skip!
          if (currentListIdRef.current === ytData.listId) {
            playerRef.current.playVideoAt(ytData.index);
          } else {
            playerRef.current.cuePlaylist({ list: ytData.listId, index: ytData.index });
            currentListIdRef.current = ytData.listId;
          }
        } else {
          playerRef.current.cueVideoById(ytData.videoId);
          currentListIdRef.current = null;
        }
      } catch (e) {}
    }
  }, [rawUrl, ytData, isReady]);

  // 3. Play/Pause
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      if (isPlaying) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();
    } catch (err) {}
  }, [isPlaying, isReady]);

  // 4. Volume
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try { playerRef.current.setVolume(volume); } catch (err) {}
  }, [volume, isReady]);

  // 5. Time Sync
  useEffect(() => {
    if (!isReady || !playerRef.current || !isPlaying) return;
    try {
      const currentTime = playerRef.current.getCurrentTime();
      if (Math.abs(currentTime - playedSeconds) > 3) {
        playerRef.current.seekTo(playedSeconds, true);
      }
    } catch (err) {}
  }, [playedSeconds, isReady, isPlaying]);

  // Secretly fetch the real name of the current track
  useEffect(() => {
    if (!ytData.videoId || trackNames[ytData.videoId]) return;
    
    fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytData.videoId}`)
      .then(res => res.json())
      .then(data => {
        if (data.title) {
          setTrackNames(prev => ({ ...prev, [ytData.videoId]: data.title }));
        }
      })
      .catch(() => {});
  }, [ytData.videoId, trackNames]);


  // ==========================================
  // MEDIA CONTROLLER LOGIC
  // ==========================================
  const handlePlayPause = () => socket.emit('TOGGLE_PLAY', { roomId, isPlaying: !isPlaying });
  
  const handleQueueSong = (e) => {
    e.preventDefault();
    if (urlInput.trim()) {
      socket.emit('UPDATE_TRACK', { roomId, url: urlInput });
      setUrlInput('');
    }
  };

  const handleRewind = () => {
    if (playerRef.current && isReady) {
      const newTime = Math.max(0, playerRef.current.getCurrentTime() - 5);
      socket.emit('SYNC_TIME', { roomId, playedSeconds: newTime });
    }
  };

  const handleFastForward = () => {
    if (playerRef.current && isReady) {
      const newTime = playerRef.current.getCurrentTime() + 5;
      socket.emit('SYNC_TIME', { roomId, playedSeconds: newTime });
    }
  };

  const handleSelectPlaylistTrack = (targetIndex, shouldPause = false) => {
    setCurrentTrackIndex(targetIndex); // Force UI to instantly snap to the new track
    
    const newUrl = `https://www.youtube.com/watch?v=${playlistIds[targetIndex]}&list=${ytData.listId}&index=${targetIndex + 1}`;
    socket.emit('UPDATE_TRACK', { roomId, url: newUrl });
    
    // CRITICAL FIX: If the user clicked Next/Prev, we override the backend's auto-play
    // and force the room into a paused state a split second later.
    if (shouldPause) {
      setTimeout(() => {
        socket.emit('TOGGLE_PLAY', { roomId, isPlaying: false });
      }, 50);
    }
  };

  const handlePrevTrack = () => {
    if (playlistIds.length > 0 && currentTrackIndex > 0) {
      handleSelectPlaylistTrack(currentTrackIndex - 1, true); // `true` triggers the pause override
    }
  };

  const handleNextTrack = () => {
    if (playlistIds.length > 0 && currentTrackIndex < playlistIds.length - 1) {
      handleSelectPlaylistTrack(currentTrackIndex + 1, true); // `true` triggers the pause override
    }
  };

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="body">
      <div
        ref={nodeRef}
        className={`fixed z-[9999] bg-gray-900 border border-gray-700 shadow-2xl transition-all duration-300 overflow-hidden flex flex-col ${
          isMinimized ? 'rounded-full p-1' : 'rounded-xl'
        }`}
        style={{
          bottom: '20px', left: '20px',
          width: isMinimized ? 'max-content' : '90vw',
          maxWidth: isMinimized ? 'none' : '320px'
        }}
      >
        
        {/* CAPSULE VIEW */}
        {isMinimized && (
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="drag-handle cursor-grab text-gray-500 hover:text-white flex items-center pr-1">
              <GripHorizontal size={18} />
            </div>
            
            <button onClick={handlePrevTrack} className={`text-gray-400 hover:text-white ${playlistIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}><SkipBack size={14} /></button>
            
            <button onClick={handlePlayPause} className="text-sky-400 bg-sky-900/30 p-2 rounded-full hover:bg-sky-900/50 transition-colors mx-1">
              {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
            </button>
            
            <button onClick={handleNextTrack} className={`text-gray-400 hover:text-white ${playlistIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}><SkipForward size={14} /></button>
            
            {playlistIds.length > 1 && (
              <ListMusic size={14} className="text-sky-500 ml-1" />
            )}
            
            <button onClick={() => setIsMinimized(false)} className="text-gray-400 hover:text-white p-1 pl-2 border-l border-gray-700 ml-1">
              <Maximize2 size={16} />
            </button>
          </div>
        )}

        {/* EXPANDED VIEW HEADER */}
        <div style={{ display: isMinimized ? 'none' : 'block' }}>
          <div className="drag-handle w-full bg-gray-800 p-2 flex justify-between items-center cursor-grab border-b border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 px-2">
              <GripHorizontal size={16}/> <span className="text-xs font-bold uppercase tracking-wider text-sky-400">DJ Booth</span>
            </div>
            <button onClick={() => setIsMinimized(true)} className="text-gray-400 hover:text-white px-2">
              <Minimize2 size={16} />
            </button>
          </div>
        </div>

        {/* YOUTUBE IFRAME WITH INVISIBLE CLICK SHIELD */}
        <div
          style={{
            width: '100%',
            height: isMinimized ? '0px' : '170px',
            visibility: isMinimized ? 'hidden' : 'visible',
            position: isMinimized ? 'absolute' : 'relative',
            top: isMinimized ? '-9999px' : 'auto',
            backgroundColor: '#000'
          }}
        >
          <div 
            className="absolute inset-0 z-10" 
            style={{ cursor: 'not-allowed' }}
            title="Use the buttons below to control playback"
          ></div>
          
          <div ref={playerContainerRef} style={{ width: '100%', height: '100%' }}></div>
        </div>

        {/* PLAYLIST DRAWER */}
        {!isMinimized && playlistIds.length > 1 && (
          <div className="px-3 pt-3">
            <div className="text-[10px] text-sky-400 mb-1 font-bold tracking-wider flex items-center gap-1">
              <ListMusic size={12}/> PLAYLIST ({playlistIds.length} Tracks)
            </div>
            <div className="max-h-28 overflow-y-auto bg-gray-950 rounded border border-gray-800 block custom-scrollbar">
              {playlistIds.map((id, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPlaylistTrack(idx, false)} // Clicking a track directly auto-plays it
                  className={`w-full block shrink-0 text-left px-3 py-2 text-[11px] border-b border-gray-800 last:border-0 hover:bg-gray-800 transition-colors truncate ${
                    currentTrackIndex === idx ? 'text-sky-400 font-bold bg-gray-800' : 'text-gray-400'
                  }`}
                >
                  {currentTrackIndex === idx && <Play size={10} className="inline mr-1 mb-[2px]" />}
                  {trackNames[id] || `Track ${idx + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* EXPANDED CONTROLS */}
        {!isMinimized && (
          <div className="p-3 flex flex-col gap-3">
            
            <form onSubmit={handleQueueSong} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste Video or Playlist URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-white text-xs outline-none focus:border-sky-400"
              />
              <button type="submit" className="px-3 py-1.5 bg-sky-400 text-gray-900 rounded-md font-bold hover:bg-sky-300">
                <Music size={14} />
              </button>
            </form>

            <div className="flex items-center justify-center gap-5 bg-gray-950/50 py-2 rounded-lg border border-gray-800">
              <button onClick={handlePrevTrack} className={`text-gray-400 hover:text-white transition-colors ${playlistIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <SkipBack size={18} />
              </button>
              
              <button onClick={handleRewind} className="text-gray-400 hover:text-white transition-colors" title="-5 Seconds">
                <Rewind size={18} />
              </button>
              
              <button onClick={handlePlayPause} className="w-10 h-10 rounded-full bg-sky-400 text-gray-900 flex items-center justify-center hover:bg-sky-300 shadow-lg shadow-sky-400/20 transition-all">
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
              </button>
              
              <button onClick={handleFastForward} className="text-gray-400 hover:text-white transition-colors" title="+5 Seconds">
                <FastForward size={18} />
              </button>
              
              <button onClick={handleNextTrack} className={`text-gray-400 hover:text-white transition-colors ${playlistIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <SkipForward size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3 px-1">
              <Volume2 size={14} className="text-gray-500" />
              <input
                type="range"
                min="0" max="100" step="1"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer h-1 bg-gray-800 rounded-lg appearance-none"
              />
            </div>

          </div>
        )}
      </div>
    </Draggable>
  );
}