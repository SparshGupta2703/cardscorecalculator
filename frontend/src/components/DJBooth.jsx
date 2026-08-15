import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { Play, Pause, Volume2, Music, FastForward, GripHorizontal } from 'lucide-react';
import { socket } from '../socket/socketClient';

// Helper to extract the 11-char YouTube Video ID from any URL format
const extractVideoId = (url) => {
  if (!url) return 'LXb3EKWsInQ'; // Costa Rica 4K default
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  return match ? match[1] : 'LXb3EKWsInQ';
};

export default function DJBooth({ roomId, musicState }) {
  const nodeRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [volume, setVolume] = useState(50); // 0 to 100

  const rawUrl = musicState?.url || '';
  const isPlaying = musicState?.isPlaying || false;
  const playedSeconds = musicState?.playedSeconds || 0;
  const currentVideoId = extractVideoId(rawUrl);

  // 1. Load the official YouTube IFrame API Script & Initialize
  useEffect(() => {
    let isSubscribed = true;

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player || !playerContainerRef.current) return;

      // If already initialized, just swap videos
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.cueVideoById(currentVideoId);
        return;
      }

      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        height: '170',
        width: '100%',
        videoId: currentVideoId,
        playerVars: {
          playsinline: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1
        },
        events: {
          onReady: (event) => {
            if (!isSubscribed) return;
            setIsReady(true);
            event.target.setVolume(volume);
            if (isPlaying) {
              event.target.playVideo();
            }
          },
          onError: (e) => {
            console.error('YouTube Player Error code:', e.data);
          }
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

    return () => {
      isSubscribed = false;
    };
  }, [currentVideoId]);

  // 2. Play / Pause Control
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch (err) {
      console.warn('Playback change error:', err);
    }
  }, [isPlaying, isReady]);

  // 3. Volume Control
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      playerRef.current.setVolume(volume);
    } catch (err) {
      console.warn('Volume set error:', err);
    }
  }, [volume, isReady]);

  // 4. Seek / Time Sync
  useEffect(() => {
    if (!isReady || !playerRef.current || !isPlaying) return;
    try {
      const currentTime = playerRef.current.getCurrentTime();
      if (Math.abs(currentTime - playedSeconds) > 3) {
        playerRef.current.seekTo(playedSeconds, true);
      }
    } catch (err) {
      console.warn('Seek error:', err);
    }
  }, [playedSeconds, isReady, isPlaying]);

  const handlePlayPause = () => {
    socket.emit('TOGGLE_PLAY', { roomId, isPlaying: !isPlaying });
  };

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
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          width: '90vw',
          maxWidth: '320px',
          backgroundColor: '#1f2937',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          border: '1px solid #374151',
          zIndex: 9999,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* DRAG HANDLE */}
        <div
          className="drag-handle"
          style={{
            width: '100%',
            backgroundColor: '#111827',
            padding: '6px',
            display: 'flex',
            justifyContent: 'center',
            cursor: 'grab',
            borderBottom: '1px solid #374151'
          }}
        >
          <GripHorizontal size={16} color="#6b7280" />
        </div>

        {/* DAISYUI COLLAPSIBLE CONTAINER */}
        <div className="collapse collapse-arrow bg-gray-800 rounded-none border-b border-gray-700">
          <input type="checkbox" defaultChecked style={{ minHeight: 0 }} />
          <div className="collapse-title text-sm font-medium py-2 min-h-0 text-sky-400">
            📺 Show / Hide Video
          </div>
          <div className="collapse-content px-0 pb-0">
            <div style={{ width: '100%', height: '170px', backgroundColor: '#000' }}>
              {/* Target element where window.YT binds */}
              <div ref={playerContainerRef} style={{ width: '100%', height: '100%' }}></div>
            </div>
          </div>
        </div>

        {/* CONTROLS */}
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <form onSubmit={handleQueueSong} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Paste YouTube URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: '#111827',
                color: 'white',
                fontSize: '12px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '6px 12px',
                background: '#38bdf8',
                color: '#0f172a',
                borderRadius: '6px',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Music size={14} />
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handlePlayPause}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#38bdf8',
                  color: '#0f172a',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
              </button>
              <button
                onClick={handleSkipForward}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <FastForward size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
              <Volume2 size={16} color="#94a3b8" />
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>
      </div>
    </Draggable>
  );
}