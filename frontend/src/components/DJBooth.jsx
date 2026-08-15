import React, { useState, useRef, useEffect, useMemo } from 'react';
import Draggable from 'react-draggable';
import { Play, Pause, Volume2, Music, FastForward, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { socket } from '../socket/socketClient';

// NEW: Advanced parser that detects both Single Videos AND Playlists
const parseYouTubeUrl = (url) => {
  if (!url) return { videoId: 'LXb3EKWsInQ', listId: null };
  
  const listMatch = url.match(/[?&]list=([^#\&\?]+)/);
  const videoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);

  return {
    videoId: videoMatch ? videoMatch[1] : (listMatch ? '' : 'LXb3EKWsInQ'),
    listId: listMatch ? listMatch[1] : null
  };
};

export default function DJBooth({ roomId, musicState }) {
  const nodeRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  const prevUrlRef = useRef('');

  const [isReady, setIsReady] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true); // Default to capsule mode!
  const [urlInput, setUrlInput] = useState('');
  const [volume, setVolume] = useState(50); 

  const rawUrl = musicState?.url || '';
  const isPlaying = musicState?.isPlaying || false;
  const playedSeconds = musicState?.playedSeconds || 0;
  
  const ytData = useMemo(() => parseYouTubeUrl(rawUrl), [rawUrl]);

  // 1. Initialize Player (Runs Once)
  useEffect(() => {
    let isSubscribed = true;

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player || !playerContainerRef.current) return;
      if (playerRef.current) return; 

      const playerVars = { playsinline: 1, controls: 1, rel: 0, modestbranding: 1 };
      
      // Inject playlist variables if a playlist is detected on load
      if (ytData.listId) {
        playerVars.listType = 'playlist';
        playerVars.list = ytData.listId;
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

  // 2. Handle Dynamic URL/Playlist Changes
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    
    if (rawUrl !== prevUrlRef.current) {
      prevUrlRef.current = rawUrl;
      try {
        if (ytData.listId) {
          playerRef.current.cuePlaylist({ list: ytData.listId });
        } else {
          playerRef.current.cueVideoById(ytData.videoId);
        }
      } catch (e) {
        console.warn("Failed to load new track:", e);
      }
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

  const handlePlayPause = () => socket.emit('TOGGLE_PLAY', { roomId, isPlaying: !isPlaying });
  
  const handleQueueSong = (e) => {
    e.preventDefault();
    if (urlInput.trim()) {
      socket.emit('UPDATE_TRACK', { roomId, url: urlInput });
      setUrlInput('');
    }
  };

  const handleSkipForward = () => {
    if (playerRef.current && isReady) {
      const newTime = playerRef.current.getCurrentTime() + 10;
      socket.emit('SYNC_TIME', { roomId, playedSeconds: newTime });
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
        
        {/* ========================================= */}
        {/* CAPSULE VIEW (Only visible when minimized)  */}
        {/* ========================================= */}
        {isMinimized && (
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="drag-handle cursor-grab text-gray-500 hover:text-white flex items-center pr-1">
              <GripHorizontal size={18} />
            </div>
            <button onClick={handlePlayPause} className="text-sky-400 bg-sky-900/30 p-2 rounded-full hover:bg-sky-900/50 transition-colors">
              {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
            </button>
            <button onClick={handleSkipForward} className="text-gray-400 hover:text-white p-1">
              <FastForward size={16} />
            </button>
            <button onClick={() => setIsMinimized(false)} className="text-gray-400 hover:text-white p-1 pl-2 border-l border-gray-700">
              <Maximize2 size={16} />
            </button>
          </div>
        )}

        {/* ========================================= */}
        {/* FULL VIEW HEADER (Visible when expanded)    */}
        {/* ========================================= */}
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

        {/* ========================================= */}
        {/* YOUTUBE IFRAME CONTAINER                  */}
        {/* Must never be display:none so music plays */}
        {/* ========================================= */}
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
          <div ref={playerContainerRef} style={{ width: '100%', height: '100%' }}></div>
        </div>

        {/* ========================================= */}
        {/* EXPANDED CONTROLS                         */}
        {/* ========================================= */}
        {!isMinimized && (
          <div className="p-3 flex flex-col gap-3">
            <form onSubmit={handleQueueSong} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste Video or Playlist URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-md border border-gray-600 bg-gray-800 text-white text-xs outline-none focus:border-sky-400"
              />
              <button type="submit" className="px-3 py-1.5 bg-sky-400 text-gray-900 rounded-md font-bold hover:bg-sky-300">
                <Music size={14} />
              </button>
            </form>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={handlePlayPause} className="w-8 h-8 rounded-full bg-sky-400 text-gray-900 flex items-center justify-center hover:bg-sky-300">
                  {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <button onClick={handleSkipForward} className="w-8 h-8 rounded-full text-gray-400 hover:text-white flex items-center justify-center">
                  <FastForward size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 w-32">
                <Volume2 size={16} className="text-gray-400" />
                <input
                  type="range"
                  min="0" max="100" step="1"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Draggable>
  );
}