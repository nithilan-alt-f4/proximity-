import React, { useState } from "react";
import { useAudio } from "../context/AudioContext";
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, Maximize2, Music,
} from "lucide-react";

interface MusicPlayerProps {
  onOpenDrawer?: (drawer: "queue" | "lyrics" | "eq" | "viz" | null) => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ onOpenDrawer }) => {
  const {
    currentSong, isPlaying, currentTime, duration, volume, isMuted,
    shuffle, repeat, togglePlay, seek, setVolumeLevel, toggleMute,
    toggleShuffle, setRepeatMode, nextSong, prevSong, queue, queueIndex,
  } = useAudio();

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const cycleRepeatMode = () => {
    if (repeat === "none") setRepeatMode("all");
    else if (repeat === "all") setRepeatMode("one");
    else setRepeatMode("none");
  };

  if (!currentSong) {
    return (
      <div className="control-panel">
        <div className="control-now">
          <div className="sleeve" style={{ width: 50, height: 50 }}>
            <span className="sleeve-ring" />
            <span className="sleeve-cross sleeve-cross-one" />
            <span className="sleeve-cross sleeve-cross-two" />
          </div>
          <div className="control-copy">
            <span className="micro-label">NO TRACK LOADED</span>
            <strong style={{ color: "var(--text-secondary)" }}>SELECT A CUT</strong>
            <span>TO BEGIN PLAYBACK</span>
          </div>
        </div>
        <div className="transport" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="transport-buttons">
            <button className="transport-button" onClick={prevSong} title="Previous"><SkipBack size={16} /></button>
            <button className="transport-button transport-main" onClick={togglePlay} title="Play"><Play size={18} /></button>
            <button className="transport-button" onClick={nextSong} title="Next"><SkipForward size={16} /></button>
          </div>
        </div>
        <div className="waveform" />
        <div className="volume-control">
          <div className="volume-label">
            <Volume2 size={14} />
            <span className="micro-label">VOLUME</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolumeLevel(parseFloat(e.target.value))} />
        </div>
        <div className="control-actions" />
      </div>
    );
  }

  return (
    <div className="control-panel">
      {/* Now Playing Info */}
      <div className="control-now">
        <div className="sleeve" style={{ width: 50, height: 50 }}>
          {currentSong.albumCover ? (
            <img src={currentSong.albumCover} alt="" referrerPolicy="no-referrer" />
          ) : (
            <>
              <span className="sleeve-ring" />
              <span className="sleeve-cross sleeve-cross-one" />
              <span className="sleeve-cross sleeve-cross-two" />
            </>
          )}
        </div>
        <div className="control-copy">
          <span className="micro-label">NOW PLAYING</span>
          <strong>{currentSong.title}</strong>
          <span>{currentSong.artist}{currentSong.album ? ` / ${currentSong.album}` : ""}</span>
        </div>
      </div>

      {/* Transport Controls */}
      <div className="transport">
        <div className="transport-top">
          <span className="micro-label">TRANSPORT</span>
          <span className="micro-label">CUT {queueIndex + 1}/{queue.length}</span>
        </div>
        <div className="transport-buttons" style={{ justifyContent: "center" }}>
          <button className={`transport-button ${shuffle ? "control-icon-active" : ""}`} onClick={toggleShuffle} title="Shuffle">
            <Shuffle size={14} />
          </button>
          <button className="transport-button" onClick={prevSong} title="Previous">
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button className="transport-button transport-main" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="transport-button" onClick={nextSong} title="Next">
            <SkipForward size={16} fill="currentColor" />
          </button>
          <button className={`transport-button ${repeat !== "none" ? "control-icon-active" : ""}`} onClick={cycleRepeatMode} title={`Repeat: ${repeat}`}>
            {repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
          </button>
        </div>
      </div>

      {/* Waveform / Progress */}
      <div className="waveform">
        <div className="waveform-bars" aria-hidden="true">
          {Array.from({ length: 40 }, (_, i) => (
            <span
              key={i}
              className={i <= Math.floor((currentTime / (duration || 1)) * 40) ? "wave-active" : ""}
              style={{ height: `${Math.max(10, Math.sin(i * 0.3) * 20 + 12)}px` }}
            />
          ))}
        </div>
        <div className="waveform-time">
          <span className="micro-label">{formatTime(currentTime)}</span>
          <input
            type="range" min="0" max={duration || 100} step="0.1"
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            style={{ flex: 1, height: 2 }}
          />
          <span className="micro-label">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="volume-control">
        <div className="volume-label">
          <button onClick={toggleMute} style={{ color: isMuted ? "var(--red)" : "inherit" }}>
            {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <span className="micro-label">VOL {Math.round((isMuted ? 0 : volume) * 100)}%</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
        />
      </div>


    </div>
  );
};

export default MusicPlayer;
