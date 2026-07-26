import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import audioDb, { Song, Playlist, EqProfile, DEFAULT_EQ_PRESETS } from "../lib/db";

export type PlayerTheme = "red" | "green" | "blue" | "orange" | "slate";

interface AudioContextType {
  songs: Song[];
  playlists: Playlist[];
  eqProfiles: EqProfile[];
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  activePlaylistId: string | null;
  queue: Song[];
  queueIndex: number;
  activeEqProfile: EqProfile;
  analyserNode: AnalyserNode | null;
  theme: PlayerTheme;
  setTheme: (theme: PlayerTheme) => void;
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
  
  loadSongs: () => Promise<void>;
  loadPlaylists: () => Promise<void>;
  loadEqProfiles: () => Promise<void>;
  playSong: (song: Song, customQueue?: Song[]) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolumeLevel: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: "none" | "one" | "all") => void;
  nextSong: () => void;
  prevSong: () => void;
  applyEqProfile: (profile: EqProfile) => void;
  createPlaylist: (name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addSongToPlaylist: (songId: string, playlistId: string) => Promise<void>;
  removeSongFromPlaylist: (songId: string, playlistId: string) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;
  saveCustomEqProfile: (name: string, gains: number[]) => Promise<EqProfile>;
  deleteEqProfile: (id: string) => Promise<void>;
  setActivePlaylistId: (id: string | null) => void;
  updateSongLyrics: (songId: string, lyrics: string, syncedLyrics: any[], title?: string, artist?: string) => Promise<void>;
  setQueue: (queue: Song[]) => void;
  playNext: (song: Song) => void;
  addToQueue: (song: Song) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [eqProfiles, setEqProfiles] = useState<EqProfile[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"none" | "one" | "all">("all");
  const [activePlaylistId, setActivePlaylistIdState] = useState<string | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [activeEqProfile, setActiveEqProfile] = useState<EqProfile>(DEFAULT_EQ_PRESETS[0]);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [theme, setThemeState] = useState<PlayerTheme>(() => {
    const saved = localStorage.getItem("audiovisual_player_theme");
    return (saved as PlayerTheme) || "red";
  });

  const setTheme = (t: PlayerTheme) => {
    setThemeState(t);
    localStorage.setItem("audiovisual_player_theme", t);
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  // References for Web Audio API
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const isAudioNodesSetupRef = useRef(false);
  const currentSongIdRef = useRef<string | null>(null);
  // Holds the pre-shuffle queue order so shuffle can be toggled back off cleanly
  const preShuffleQueueRef = useRef<Song[] | null>(null);
  // Always points at the latest handleSongEnded closure. The "ended" listener below is
  // registered once (in the mount-only effect) so without this ref it would keep calling
  // a stale version of handleSongEnded that closes over the very first render's empty
  // queue/queueIndex/repeat state - which is why songs previously failed to autoplay.
  const handleSongEndedRef = useRef<() => void>(() => {});

  // Initialize Audio Element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      handleSongEndedRef.current();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);

    // Initial load from IndexedDB
    loadAllData();

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Watch current song changes to load source and play
  useEffect(() => {
    if (!audioRef.current) return;

    if (currentSong) {
      // Only reload the source if the song ID has actually changed!
      if (currentSongIdRef.current !== currentSong.id) {
        currentSongIdRef.current = currentSong.id;

        // Create Object URL for Blob
        const objectUrl = URL.createObjectURL(currentSong.audioBlob);
        const prevSrc = audioRef.current.src;
        audioRef.current.src = objectUrl;
        
        // Cleanup previous Object URL if we had one
        if (prevSrc && prevSrc.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(prevSrc);
          } catch (e) {}
        }

        if (isPlaying) {
          audioRef.current.play().catch((err) => {
            console.warn("Autoplay blocked or play failed:", err);
            setIsPlaying(false);
          });
        }
      }
    } else {
      currentSongIdRef.current = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
    }
  }, [currentSong]);

  // Handle Play/Pause changes
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;

    if (isPlaying) {
      // Setup audio nodes on first play (requires user interaction gesture)
      initAudioEngine();
      audioRef.current.play().catch((err) => {
        console.warn("Play failed:", err);
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Volume & Mute synchronizer
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Background lyric pre-fetching engine for remaining songs in the library
  const prefetchedSongIdsRef = useRef<Set<string>>(new Set());
  const isPrefetchingRef = useRef(false);

  useEffect(() => {
    if (!isPlaying || !currentSong) return;

    // Find other songs that need lyrics fetched
    const songsToPrefetch = songs.filter(
      (s) => s.id !== currentSong.id && (!s.syncedLyrics || s.syncedLyrics.length === 0) && !prefetchedSongIdsRef.current.has(s.id)
    );

    if (songsToPrefetch.length === 0 || isPrefetchingRef.current) return;

    let active = true;
    isPrefetchingRef.current = true;

    const prefetchSequential = async () => {
      // 5-second delay to let the initial song load and playback stabilize
      await new Promise((resolve) => setTimeout(resolve, 5000));

      for (const targetSong of songsToPrefetch) {
        if (!active || !isPlaying || currentSong?.id === targetSong.id) break;

        // Skip if already in the prefetched set (added by user during playback, etc.)
        if (targetSong.syncedLyrics && targetSong.syncedLyrics.length > 0) continue;

        // Mark as attempted in this session
        prefetchedSongIdsRef.current.add(targetSong.id);

        try {
          const res = await fetch("/api/lyrics/find", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: targetSong.title,
              artist: targetSong.artist === "Unknown Artist" ? "" : targetSong.artist,
              duration: targetSong.duration,
            }),
          });

          if (res.ok && active) {
            const data = await res.json();
            const parsedLyrics = data.lyrics || "";
            const parsedSynced = (data.syncedLyrics || []).map((l: any) => ({
              time: parseFloat(l.time) || 0,
              text: String(l.text || ""),
            })).sort((a: any, b: any) => a.time - b.time);

            const updatedSong: Song = {
              ...targetSong,
              lyrics: parsedLyrics,
              syncedLyrics: parsedSynced,
            };
            await audioDb.saveSong(updatedSong);

            // Update React state so the LRC badge and lyrics are immediately available in the library
            setSongs((prev) => {
              return prev.map((s) => (s.id === targetSong.id ? updatedSong : s));
            });
          }
        } catch (err) {
          console.warn(`[Background Prefetch] Failed for "${targetSong.title}":`, err);
        }

        // Wait 4 seconds between requests to avoid overloading the API
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      isPrefetchingRef.current = false;
    };

    prefetchSequential();

    return () => {
      active = false;
      isPrefetchingRef.current = false;
    };
  }, [isPlaying, currentSong?.id, songs]);

  // Load functions
  const loadAllData = async () => {
    await Promise.all([loadSongs(), loadPlaylists(), loadEqProfiles()]);
  };

  const loadSongs = async () => {
    const loadedSongs = await audioDb.getAllSongs();
    setSongs(loadedSongs.sort((a, b) => b.createdAt - a.createdAt));
  };

  const loadPlaylists = async () => {
    const loadedPlaylists = await audioDb.getAllPlaylists();
    setPlaylists(loadedPlaylists.sort((a, b) => b.createdAt - a.createdAt));
  };

  const loadEqProfiles = async () => {
    const loadedProfiles = await audioDb.getAllEqProfiles();
    setEqProfiles(loadedProfiles);
  };

  // Web Audio Setup
  const initAudioEngine = () => {
    if (!audioRef.current) return;
    if (isAudioNodesSetupRef.current) {
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume();
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      audioCtxRef.current = context;

      const source = context.createMediaElementSource(audioRef.current);
      
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // 10-band equalizer frequencies
      const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      const filters = frequencies.map((freq) => {
        const filter = context.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = freq;
        filter.Q.value = 1.414;
        filter.gain.value = 0; // default flat
        return filter;
      });
      filtersRef.current = filters;

      // Connect source -> filter0 -> ... -> filter9 -> analyser -> destination
      let currentNode: AudioNode = source;
      filters.forEach((filter) => {
        currentNode.connect(filter);
        currentNode = filter;
      });
      currentNode.connect(analyser);
      analyser.connect(context.destination);

      setAnalyserNode(analyser);
      isAudioNodesSetupRef.current = true;

      // Apply currently selected EQ profile
      applyEqToNodes(activeEqProfile);

      if (context.state === "suspended") {
        context.resume();
      }
    } catch (error) {
      console.error("Failed to initialize Web Audio Engine:", error);
    }
  };

  const applyEqToNodes = (profile: EqProfile) => {
    if (!isAudioNodesSetupRef.current || filtersRef.current.length === 0) return;
    filtersRef.current.forEach((filter, index) => {
      if (profile.gains[index] !== undefined) {
        filter.gain.value = profile.gains[index];
      }
    });
  };

  // Change playlist selection
  const setActivePlaylistId = (playlistId: string | null) => {
    setActivePlaylistIdState(playlistId);
    
    let baseSongs = [...songs];
    if (playlistId !== null) {
      const pl = playlists.find((p) => p.id === playlistId);
      if (pl) {
        baseSongs = songs.filter((s) => pl.songIds.includes(s.id));
        // Sort according to playlist order
        baseSongs.sort((a, b) => pl.songIds.indexOf(a.id) - pl.songIds.indexOf(b.id));
      } else {
        baseSongs = [];
      }
    }

    if (baseSongs.length > 0) {
      setQueue(baseSongs);
      if (playlistId !== null) {
        // Start playing songs from this playlist immediately
        setCurrentSong(baseSongs[0]);
        setQueueIndex(0);
        setIsPlaying(true);
      } else {
        // If there's a current playing song that is in the new playlist, set index. Otherwise reset index.
        if (currentSong) {
          const idx = baseSongs.findIndex((s) => s.id === currentSong.id);
          setQueueIndex(idx);
        } else {
          setQueueIndex(-1);
        }
      }
    } else {
      setQueue([]);
      setQueueIndex(-1);
    }
  };

  // Player controls
  const playSong = (song: Song, customQueue?: Song[]) => {
    if (customQueue) {
      setQueue(customQueue);
      const idx = customQueue.findIndex((s) => s.id === song.id);
      setQueueIndex(idx !== -1 ? idx : 0);
    } else {
      // Use active queue or build from all songs
      let currentQueue = queue;
      if (queue.length === 0 || !queue.some((s) => s.id === song.id)) {
        currentQueue = activePlaylistId 
          ? songs.filter(s => playlists.find(p => p.id === activePlaylistId)?.songIds.includes(s.id))
          : [...songs];
        setQueue(currentQueue);
      }
      const idx = currentQueue.findIndex((s) => s.id === song.id);
      setQueueIndex(idx !== -1 ? idx : 0);
    }
    
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (!currentSong && songs.length > 0) {
      // Play first song
      playSong(songs[0]);
    } else if (currentSong) {
      setIsPlaying(!isPlaying);
    }
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const setVolumeLevel = (vol: number) => {
    const bounded = Math.max(0, Math.min(1, vol));
    setVolume(bounded);
    if (bounded > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleShuffle = () => {
    if (!shuffle) {
      // Turning shuffle ON: shuffle the current queue in place (keeping the currently
      // playing song anchored at the front) so nextSong() can just walk forward through
      // it sequentially, instead of picking a new random song every time.
      if (queue.length > 1) {
        preShuffleQueueRef.current = queue;

        const current = queueIndex >= 0 ? queue[queueIndex] : null;
        const rest = queue.filter((_, i) => i !== queueIndex);

        // Fisher-Yates shuffle
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }

        const shuffledQueue = current ? [current, ...rest] : rest;
        setQueue(shuffledQueue);
        setQueueIndex(0);
      }
    } else {
      // Turning shuffle OFF: restore the queue to its pre-shuffle order if we saved one
      if (preShuffleQueueRef.current) {
        const restored = preShuffleQueueRef.current;
        preShuffleQueueRef.current = null;
        setQueue(restored);
        if (currentSong) {
          const idx = restored.findIndex((s) => s.id === currentSong.id);
          setQueueIndex(idx !== -1 ? idx : 0);
        }
      }
    }

    setShuffle(!shuffle);
  };

  const setRepeatMode = (mode: "none" | "one" | "all") => {
    setRepeat(mode);
  };

  const nextSong = () => {
    if (queue.length === 0) return;

    // Note: shuffle no longer re-randomizes on every call. When shuffle is turned on,
    // the queue itself gets shuffled once (see toggleShuffle) and playback simply
    // advances through that shuffled order sequentially, same as normal playback.
    let nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) {
      if (repeat === "all") {
        nextIdx = 0;
      } else {
        // End of queue and no repeat
        setIsPlaying(false);
        return;
      }
    }

    setQueueIndex(nextIdx);
    setCurrentSong(queue[nextIdx]);
  };

  const prevSong = () => {
    if (queue.length === 0) return;

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      if (repeat === "all") {
        prevIdx = queue.length - 1;
      } else {
        prevIdx = 0; // clamp to start
      }
    }

    setQueueIndex(prevIdx);
    setCurrentSong(queue[prevIdx]);
  };

  const handleSongEnded = () => {
    if (repeat === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } else {
      nextSong();
    }
  };

  // Keep the ref pointed at the latest handleSongEnded on every render so the
  // audio element's "ended" listener (attached once on mount) always sees
  // up-to-date queue/queueIndex/repeat state instead of the initial render's.
  useEffect(() => {
    handleSongEndedRef.current = handleSongEnded;
  });

  const applyEqProfile = (profile: EqProfile) => {
    setActiveEqProfile(profile);
    applyEqToNodes(profile);
  };

  // Playlist Management
  const createPlaylist = async (name: string) => {
    const newPlaylist: Playlist = {
      id: "pl_" + Math.random().toString(36).substr(2, 9),
      name,
      songIds: [],
      createdAt: Date.now(),
    };
    await audioDb.savePlaylist(newPlaylist);
    await loadPlaylists();
  };

  const deletePlaylist = async (id: string) => {
    await audioDb.deletePlaylist(id);
    if (activePlaylistId === id) {
      setActivePlaylistId(null);
    }
    await loadPlaylists();
  };

  const addSongToPlaylist = async (songId: string, playlistId: string) => {
    let playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) {
      const allPl = await audioDb.getAllPlaylists();
      playlist = allPl.find((p) => p.id === playlistId);
    }
    if (!playlist) return;

    if (!playlist.songIds.includes(songId)) {
      const updatedPlaylist = {
        ...playlist,
        songIds: [...playlist.songIds, songId]
      };
      await audioDb.savePlaylist(updatedPlaylist);
      
      // Safe, immutable state update
      setPlaylists((prev) => {
        const exists = prev.some((p) => p.id === playlistId);
        if (exists) {
          return prev.map((p) => (p.id === playlistId ? updatedPlaylist : p));
        } else {
          return [updatedPlaylist, ...prev];
        }
      });

      // Update queue if it is the currently active playlist
      if (activePlaylistId === playlistId) {
        await loadPlaylists();
        setActivePlaylistId(playlistId);
      } else {
        await loadPlaylists();
      }
    }
  };

  const removeSongFromPlaylist = async (songId: string, playlistId: string) => {
    let playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) {
      const allPl = await audioDb.getAllPlaylists();
      playlist = allPl.find((p) => p.id === playlistId);
    }
    if (!playlist) return;

    const updatedPlaylist = {
      ...playlist,
      songIds: playlist.songIds.filter((sid) => sid !== songId)
    };
    await audioDb.savePlaylist(updatedPlaylist);
    
    // Immutable state update
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updatedPlaylist : p)));

    if (activePlaylistId === playlistId) {
      await loadPlaylists();
      setActivePlaylistId(playlistId);
    } else {
      await loadPlaylists();
    }
  };

  // Song management
  const deleteSong = async (id: string) => {
    await audioDb.deleteSong(id);
    
    if (currentSong?.id === id) {
      setCurrentSong(null);
      setIsPlaying(false);
    }

    await loadSongs();
    await loadPlaylists();

    // Trigger queue refresh
    setActivePlaylistId(activePlaylistId);
  };

  const updateSongLyrics = async (songId: string, lyrics: string, syncedLyrics: any[], title?: string, artist?: string) => {
    const song = songs.find((s) => s.id === songId);
    if (!song) return;

    const updatedSong: Song = {
      ...song,
      lyrics,
      syncedLyrics,
      title: title && title.trim() ? title.trim().replace(/\.[^/.]+$/, "") : song.title,
      artist: artist && artist.trim() && artist !== "Unknown Artist" ? artist.trim() : song.artist,
    };
    await audioDb.saveSong(updatedSong);
    await loadSongs();

    if (currentSong?.id === songId) {
      setCurrentSong(updatedSong);
    }
  };

  // Custom EQ profiles
  const saveCustomEqProfile = async (name: string, gains: number[]) => {
    const id = "eq_" + Math.random().toString(36).substr(2, 9);
    const newProfile: EqProfile = {
      id,
      name,
      gains,
      isPreset: false,
    };
    await audioDb.saveEqProfile(newProfile);
    await loadEqProfiles();
    return newProfile;
  };

  const deleteEqProfile = async (id: string) => {
    await audioDb.deleteEqProfile(id);
    if (activeEqProfile.id === id) {
      applyEqProfile(DEFAULT_EQ_PRESETS[0]);
    }
    await loadEqProfiles();
  };

  const updateQueue = (newQueue: Song[]) => {
    setQueue(newQueue);
    if (currentSong) {
      const idx = newQueue.findIndex((s) => s.id === currentSong.id);
      setQueueIndex(idx);
    }
  };

  // Insert a song immediately after the currently playing track in the queue
  // (right-click "Play Next" support). If nothing is currently playing, just start it.
  const playNext = (song: Song) => {
    if (!currentSong) {
      playSong(song);
      return;
    }

    setQueue((prevQueue) => {
      // Avoid duplicate entries - drop any existing copy of this song first
      const withoutSong = prevQueue.filter((s) => s.id !== song.id);
      const currentIdx = withoutSong.findIndex((s) => s.id === currentSong.id);
      const insertAt = currentIdx === -1 ? 0 : currentIdx + 1;

      const updated = [...withoutSong];
      updated.splice(insertAt, 0, song);

      const newCurrentIdx = updated.findIndex((s) => s.id === currentSong.id);
      setQueueIndex(newCurrentIdx);

      return updated;
    });
  };

  // Append a song to the end of the queue without interrupting playback
  const addToQueue = (song: Song) => {
    if (!currentSong) {
      playSong(song);
      return;
    }

    setQueue((prevQueue) => {
      if (prevQueue.some((s) => s.id === song.id)) return prevQueue;
      return [...prevQueue, song];
    });
  };

  return (
    <AudioContext.Provider
      value={{
        songs,
        playlists,
        eqProfiles,
        currentSong,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        shuffle,
        repeat,
        activePlaylistId,
        queue,
        queueIndex,
        activeEqProfile,
        analyserNode,
        theme,
        setTheme,
        isFullscreen,
        setIsFullscreen,
        
        loadSongs,
        loadPlaylists,
        loadEqProfiles,
        playSong,
        togglePlay,
        seek,
        setVolumeLevel,
        toggleMute,
        toggleShuffle,
        setRepeatMode,
        nextSong,
        prevSong,
        applyEqProfile,
        createPlaylist,
        deletePlaylist,
        addSongToPlaylist,
        removeSongFromPlaylist,
        deleteSong,
        saveCustomEqProfile,
        deleteEqProfile,
        setActivePlaylistId,
        updateSongLyrics,
        setQueue: updateQueue,
        playNext,
        addToQueue,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
