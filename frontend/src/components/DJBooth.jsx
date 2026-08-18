import React, { useState, useRef, useEffect, useMemo } from 'react';
import Draggable from 'react-draggable';
import { 
  Play, Pause, Volume2, Music, GripHorizontal, 
  Maximize2, Minimize2, ListMusic, SkipBack, SkipForward, 
  Rewind,RefreshCw, FastForward, Search, Loader 
} from 'lucide-react';
import { socket } from '../socket/socketClient';
import toast from 'react-hot-toast';

// Extracts Video ID, Playlist ID, and Track Index
const parseYouTubeUrl = (url) => {
  if (!url) return { videoId: '', listId: 'PLl2jQn4j1xPhjPgjze0Ks19_z7gT7Eq1l', index: 0 };
  
  const listMatch = url.match(/[?&]list=([^#\&\?]+)/);
  const videoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  const indexMatch = url.match(/[?&]index=(\d+)/);

  if (!listMatch && !videoMatch) return { videoId: '', listId: 'PLl2jQn4j1xPhjPgjze0Ks19_z7gT7Eq1l', index: 0 };

  return {
    videoId: videoMatch ? videoMatch[1] : '',
    listId: listMatch ? listMatch[1] : null,
    index: indexMatch ? parseInt(indexMatch[1]) - 1 : 0 
  };
};

export default function DJBooth({ roomId, musicState }) {
  const nodeRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  
  const prevUrlRef = useRef('');
  const currentListIdRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [volume, setVolume] = useState(50); 
  
  const [playlistIds, setPlaylistIds] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [trackNames, setTrackNames] = useState({});

  // ==========================================
  // NEW SEARCH STATES
  // ==========================================
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

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
          if (currentListIdRef.current === ytData.listId) {
            playerRef.current.playVideoAt(ytData.index);
          } else {
            // CHANGED: Use loadPlaylist instead of cuePlaylist
            playerRef.current.loadPlaylist({ list: ytData.listId, index: ytData.index });
            currentListIdRef.current = ytData.listId;
          }
        } else {
          // CHANGED: Use loadVideoById instead of cueVideoById
          playerRef.current.loadVideoById(ytData.videoId);
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

  // 6. Fetch Track Names & Listen for Search Results
  useEffect(() => {
    // Track Names
    if (ytData.videoId && !trackNames[ytData.videoId]) {
      fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytData.videoId}`)
        .then(res => res.json())
        .then(data => {
          if (data.title) setTrackNames(prev => ({ ...prev, [ytData.videoId]: data.title }));
        }).catch(() => {});
    }

    // Search Results Listener
    const handleResults = (results) => {
      setSearchResults(results);
      setIsSearching(false);

      if (results.length === 0) {
        toast.error("Cloud search blocked! Please paste a direct YouTube link instead.");
      }
    };
    socket.on('YOUTUBE_RESULTS', handleResults);
    return () => socket.off('YOUTUBE_RESULTS', handleResults);
  }, [ytData.videoId, trackNames]);


  // ==========================================
  // MEDIA CONTROLLER LOGIC
  // ==========================================
  const handlePlayPause = () => socket.emit('TOGGLE_PLAY', { roomId, isPlaying: !isPlaying });
  
  // FIX: Combined URL paste and Search query into one function!
  const handleSearchOrQueue = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (searchQuery.includes('youtube.com') || searchQuery.includes('youtu.be')) {
      // It's a direct URL - Queue and AutoPlay!
      socket.emit('UPDATE_TRACK', { roomId, url: searchQuery });
      socket.emit('TOGGLE_PLAY', { roomId, isPlaying: true });
      setSearchQuery('');
      setSearchResults([]);
    } else {
      // It's a search term
      setIsSearching(true);
      socket.emit('SEARCH_YOUTUBE', searchQuery);
    }
  };

  const playSearchedVideo = (url) => {
    socket.emit('UPDATE_TRACK', { roomId, url });
    // FIX: Force it to auto-play after picking a search result
    socket.emit('TOGGLE_PLAY', { roomId, isPlaying: true });
    setSearchResults([]);
    setSearchQuery('');
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
    setCurrentTrackIndex(targetIndex); 
    const newUrl = `https://www.youtube.com/watch?v=${playlistIds[targetIndex]}&list=${ytData.listId}&index=${targetIndex + 1}`;
    socket.emit('UPDATE_TRACK', { roomId, url: newUrl });
    
    if (shouldPause) {
      setTimeout(() => { socket.emit('TOGGLE_PLAY', { roomId, isPlaying: false }); }, 50);
    } else {
      setTimeout(() => { socket.emit('TOGGLE_PLAY', { roomId, isPlaying: true }); }, 50);
    }
  };

  const handlePrevTrack = () => {
    if (playlistIds.length > 0 && currentTrackIndex > 0) handleSelectPlaylistTrack(currentTrackIndex - 1, true); 
  };

  const handleNextTrack = () => {
    if (playlistIds.length > 0 && currentTrackIndex < playlistIds.length - 1) handleSelectPlaylistTrack(currentTrackIndex + 1, true); 
  };
  const handleResync = () => {
    if (playerRef.current && isReady) {
      // Force the player to jump exactly to where the backend says it should be
      playerRef.current.seekTo(musicState.playedSeconds || 0, true);
      
      if (musicState.isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }
  };

  return (
    // FIX: Added .result-item to cancel list so clicking a search result doesn't drag the booth!
    <Draggable nodeRef={nodeRef} handle=".drag-handle" cancel="button, input, .result-item" bounds="body">
      <div
        ref={nodeRef}
        className={`fixed z-[9999] bg-gray-900 border border-gray-700 shadow-2xl transition-all duration-300 overflow-hidden flex flex-col ${
          isMinimized ? 'rounded-full p-1' : 'rounded-[2rem]'
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
            
            <button onClick={() => setIsMinimized(false)} className="text-gray-400 hover:text-white p-1 pl-2 border-l border-gray-700 ml-1 cursor-pointer">
              <Maximize2 size={16} />
            </button>
          </div>
        )}

        {/* EXPANDED VIEW HEADER */}
        <div style={{ display: isMinimized ? 'none' : 'block' }}>
          <div className="w-full bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
            <div className="drag-handle flex-1 flex items-center gap-2 text-gray-400 px-2 cursor-grab">
              <GripHorizontal size={16}/> <span className="text-xs font-bold uppercase tracking-wider text-sky-400">DJ Booth</span>
            </div>
            <button onClick={() => setIsMinimized(true)} className="text-gray-400 hover:text-white px-2 cursor-pointer">
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

        {/* SEARCH RESULTS DROPDOWN (Appears over the playlist) */}
        {!isMinimized && searchResults.length > 0 && (
          <div className="px-3 pt-3">
            <div className="max-h-32 overflow-y-auto bg-gray-950 rounded-2xl border border-gray-800 block custom-scrollbar overflow-hidden">
              {searchResults.map((vid, idx) => (
                <div 
                  key={idx} 
                  onClick={() => playSearchedVideo(vid.url)}
                  className="result-item flex items-center gap-3 p-2 border-b border-gray-800 last:border-0 hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  <img src={vid.thumbnail} alt="thumb" className="w-12 h-9 object-cover rounded" />
                  <div className="flex-1 overflow-hidden">
                    <p className="text-white text-xs truncate m-0">{vid.title}</p>
                    <p className="text-gray-500 text-[10px] m-0">{vid.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PLAYLIST DRAWER (Hidden if searching) */}
        {!isMinimized && searchResults.length === 0 && playlistIds.length > 1 && (
          <div className="px-3 pt-3">
            <div className="text-[10px] text-sky-400 mb-1 font-bold tracking-wider flex items-center gap-1 ml-2">
              <ListMusic size={12}/> PLAYLIST ({playlistIds.length} Tracks)
            </div>
            <div className="max-h-28 overflow-y-auto bg-gray-950 rounded-2xl border border-gray-800 block custom-scrollbar overflow-hidden">
              {playlistIds.map((id, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPlaylistTrack(idx, false)} 
                  className={`w-full block shrink-0 text-left px-4 py-2 text-[11px] border-b border-gray-800 last:border-0 hover:bg-gray-800 transition-colors truncate ${
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
          <div className="p-4 flex flex-col gap-4">
            
            <form onSubmit={handleSearchOrQueue} className="flex gap-2">
              <input
                type="text"
                placeholder="Search or Paste URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-2 rounded-full border border-gray-700 bg-gray-800 text-white text-xs outline-none focus:border-sky-400"
              />
              <button type="submit" className="px-4 py-2 bg-sky-400 text-gray-900 rounded-full font-bold hover:bg-sky-300 flex items-center justify-center">
                {isSearching ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </form>

            <div className="flex items-center justify-center gap-5 bg-gray-950/50 py-3 rounded-full border border-gray-800">
              <button onClick={handlePrevTrack} className={`text-gray-400 hover:text-white transition-colors ${playlistIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <SkipBack size={18} />
              </button>
              
              <button onClick={handleRewind} className="text-gray-400 hover:text-white transition-colors" title="-5 Seconds">
                <Rewind size={18} />
              </button>
              
              <button onClick={handlePlayPause} className="w-12 h-12 rounded-full bg-sky-400 text-gray-900 flex items-center justify-center hover:bg-sky-300 shadow-lg shadow-sky-400/20 transition-all">
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
              </button>
              
              <button onClick={handleFastForward} className="text-gray-400 hover:text-white transition-colors" title="+5 Seconds">
                <FastForward size={18} />
              </button>
              
              <button onClick={handleNextTrack} className={`text-gray-400 hover:text-white transition-colors ${playlistIds.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <SkipForward size={18} />
              </button>
            </div>

            {/* VOLUME & RESYNC CONTROLS */}
            <div className="flex items-center justify-between px-2 mb-1 mt-2">
              <div className="flex items-center gap-3 w-full pr-4 border-r border-gray-800">
                <Volume2 size={14} className="text-gray-500" />
                <input
                  type="range"
                  min="0" max="100" step="1"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer h-1 bg-gray-800 rounded-lg appearance-none"
                />
              </div>
              
              {/* THE NEW RESYNC BUTTON */}
              <button 
                onClick={handleResync} 
                className="pl-4 text-gray-500 hover:text-sky-400 transition-colors flex items-center gap-1"
                title="Resync audio with table"
              >
                <RefreshCw size={14} />
              </button>
            </div>

          </div>
        )}
      </div>
    </Draggable>
  );
}