import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAudio } from "../context/AudioContext";
import type { Song } from "../lib/db";
import { Visualizer } from "./Visualizer";
import { QueueManager } from "./QueueManager";
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, ArrowDown, Layers, ListMusic,
  Sun, Moon,
} from "lucide-react";

interface FullscreenPlayerProps {
  onClose: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

type TranslationLang = "original" | "english" | "hindi" | "tamil";
type LayoutMode = "lyrics" | "centered" | "viz" | "stacked";

export const FullscreenPlayer: React.FC<FullscreenPlayerProps> = ({ onClose, isDark, onToggleTheme }) => {
  const {
    currentSong, isPlaying, currentTime, duration, volume, isMuted,
    shuffle, repeat, togglePlay, seek, nextSong, prevSong,
    toggleShuffle, setRepeatMode, setVolumeLevel, toggleMute,
    queue, queueIndex, songs, playSong, setQueue,
  } = useAudio();

  const hasLyrics = (currentSong?.syncedLyrics?.length ?? 0) > 0;
  const [layout, setLayout] = useState<LayoutMode>(hasLyrics ? "lyrics" : "centered");
  const [translationLang, setTranslationLang] = useState<TranslationLang>("original");
  const [translatedSynced, setTranslatedSynced] = useState<{ time: number; text: string }[]>([]);
  const [translating, setTranslating] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [sideW, setSideW] = useState(0.92);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  // Auto-switch layout when no lyrics
  useEffect(() => {
    if (!hasLyrics && layout === "lyrics") setLayout("centered");
  }, [hasLyrics, layout]);

  // Reset on song change
  useEffect(() => {
    setTranslationLang("original");
    setTranslatedSynced([]);
    setLyricsOffset(0);
    setShowQueue(false);
  }, [currentSong?.id]);

  // Entry animation
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => playerRef.current?.classList.add("fs-in"), 50));
    timers.push(setTimeout(() => topbarRef.current?.classList.add("fs-in"), 100));
    timers.push(setTimeout(() => lyricsRef.current?.classList.add("fs-in"), 200));
    timers.push(setTimeout(() => vizRef.current?.classList.add("fs-in"), 200));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Translation
  const handleTranslate = useCallback(async (lang: string) => {
    if (!currentSong) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/lyrics/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: currentSong.lyrics || (currentSong.syncedLyrics || []).map((l) => l.text).join("\n"),
          syncedLyrics: currentSong.syncedLyrics || [],
          language: lang,
        }),
      });
      if (!res.ok) throw new Error("Translation failed");
      const data = await res.json();
      if (data.translatedSynced?.length > 0) setTranslatedSynced(data.translatedSynced);
    } catch (err) {
      console.error(err);
    } finally {
      setTranslating(false);
    }
  }, [currentSong]);

  const handleLangChange = useCallback((lang: TranslationLang) => {
    setTranslationLang(lang);
    if (lang !== "original" && translatedSynced.length === 0) {
      const langMap: Record<string, string> = { english: "English", hindi: "Hindi", tamil: "Tamil" };
      handleTranslate(langMap[lang] || lang);
    }
  }, [translatedSynced.length, handleTranslate]);

  // Lyrics sync
  const syncedLyrics = currentSong?.syncedLyrics || [];
  const displayLyrics = translationLang === "original"
    ? syncedLyrics.map((l) => ({ time: l.time, text: l.text, translation: "" }))
    : translatedSynced.length > 0
      ? syncedLyrics.map((line, i) => ({ time: line.time, text: line.text, translation: translatedSynced[i]?.text || "" }))
      : syncedLyrics.map((l) => ({ time: l.time, text: l.text, translation: "" }));

  const activeLineIndex = displayLyrics.findIndex((line, i) => {
    const next = displayLyrics[i + 1];
    const t = currentTime - lyricsOffset;
    return t >= line.time && (!next || t < next.time);
  });

  useEffect(() => {
    if (activeLineIndex === -1 || !scrollRef.current) return;
    const el = document.getElementById(`fs-lyric-${activeLineIndex}`);
    if (!el) return;
    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
    container.scrollTo({ top: container.scrollTop + offset, behavior: "smooth" });
  }, [activeLineIndex]);

  // Compute distance from active line for each lyric line (-1 = far above, 0 = active, 1 = far below)
  const getLineDistance = (idx: number): number => {
    if (activeLineIndex === -1) return 3;
    return Math.abs(idx - activeLineIndex);
  };

  // Get dynamic style for a lyric line based on distance from active
  // Dark mode: red glow + gradient fill on active, soft depth-of-field on inactive
  // Light mode: bold ink + red left accent on active, aggressive dim/blur on inactive
  const getLineStyles = (idx: number): React.CSSProperties => {
    const dist = getLineDistance(idx);
    const base = "all 400ms var(--ease-mechanical)";

    if (isDark) {
      // ── Dark mode ──
      if (dist === 0) return { opacity: 1, transform: "scale(1)", filter: "blur(0px)", textShadow: "0 0 20px var(--red), 0 0 40px rgba(200,30,30,0.3)", transition: base };
      if (dist === 1) return { opacity: 0.65, transform: "scale(0.96)", filter: "blur(0.3px)", textShadow: "none", transition: base };
      if (dist === 2) return { opacity: 0.35, transform: "scale(0.93)", filter: "blur(0.7px)", textShadow: "none", transition: base };
      return { opacity: 0.15, transform: "scale(0.91)", filter: "blur(1.2px)", textShadow: "none", transition: base };
    }

    // ── Light mode ──
    if (dist === 0) return { opacity: 1, transform: "scale(1)", filter: "blur(0px)", textShadow: "none", transition: base };
    if (dist === 1) return { opacity: 0.45, transform: "scale(0.97)", filter: "blur(0.2px)", textShadow: "none", transition: base };
    if (dist === 2) return { opacity: 0.2, transform: "scale(0.94)", filter: "blur(0.6px)", textShadow: "none", transition: base };
    return { opacity: 0.08, transform: "scale(0.92)", filter: "blur(1px)", textShadow: "none", transition: base };
  };

  const formatTime = (s: number): string => {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const cycleRepeat = () => {
    if (repeat === "none") setRepeatMode("all");
    else if (repeat === "all") setRepeatMode("one");
    else setRepeatMode("none");
  };

  // Prevent lyrics scroll from bubbling to page
  const handleLyricsWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
  }, []);

  // Sidebar resize between player and lyrics/viz column
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startW = sideW;
    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = (ev.clientX - startX) / window.innerWidth;
      setSideW(Math.max(0.4, Math.min(0.8, startW + delta)));
    };
    const onUp = () => {
      isResizingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sideW]);

  if (!currentSong) return null;

  const turntableEl = (
    <div className="fs-turntable">
      <div className="turntable-wrap" style={{ width: "100%" }}>
        <div className="turntable-shadow" />
        <div className={`record ${isPlaying ? "record-spinning" : ""}`}>
          <div className="record-grooves" />
          <div className="record-label">
            {currentSong.albumCover ? (
              <img src={currentSong.albumCover} alt="" referrerPolicy="no-referrer" />
            ) : (
              <>
                <span className="record-label-text">P+</span>
                <small>SIDE A</small>
              </>
            )}
          </div>
        </div>
        <div className={`tonearm ${isPlaying ? "tonearm-live" : ""}`}>
          <span className="tonearm-pivot" />
          <span className="tonearm-stick" />
          <span className="tonearm-head" />
        </div>
        <div className={`turntable-led ${isPlaying ? "pulse-red" : ""}`} />
      </div>
    </div>
  );

  const playerControlsEl = (
    <div className="fs-controls">
      {/* Seekbar */}
      <div className="fs-seek-row">
        <span className="fs-time">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="fs-seekbar"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
        />
        <span className="fs-time">{formatTime(duration)}</span>
      </div>

      {/* Transport buttons */}
      <div className="fs-transport-row">
        <button
          className={`fs-btn ${shuffle ? "fs-btn-active" : ""}`}
          onClick={toggleShuffle}
          title="Shuffle"
        >
          <Shuffle size={14} />
        </button>
        <button className="fs-btn" onClick={prevSong} title="Previous">
          <SkipBack size={16} fill="currentColor" />
        </button>
        <button className="fs-btn fs-btn-play" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button className="fs-btn" onClick={nextSong} title="Next">
          <SkipForward size={16} fill="currentColor" />
        </button>
        <button
          className={`fs-btn ${repeat !== "none" ? "fs-btn-active" : ""}`}
          onClick={cycleRepeat}
          title={`Repeat: ${repeat}`}
        >
          {repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
        </button>

        {/* Volume */}
        <div className="fs-volume-inline">
          <button className="fs-btn-icon" onClick={toggleMute} title="Mute">
            {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            className="fs-volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
          />
        </div>

        {/* Queue button - opens full QueueManager drawer */}
        <button 
          className="fs-btn-icon" 
          onClick={() => setShowQueue(!showQueue)} 
          title="Queue"
        >
          <ListMusic size={14} />
        </button>
      </div>
    </div>
  );

  const lyricsPanel = layout === "lyrics" || layout === "stacked" ? (
    <div className="fs-lyrics" ref={lyricsRef}>
      <div className="fs-lyrics-controls">
        <div className="fs-offset">
          <button onClick={() => setLyricsOffset((o) => o - 0.5)}>-</button>
          <span className="fs-offset-val">
            {lyricsOffset > 0 ? "+" : ""}{lyricsOffset.toFixed(1)}s
          </span>
          <button onClick={() => setLyricsOffset((o) => o + 0.5)}>+</button>
          {lyricsOffset !== 0 && (
            <button className="fs-offset-rst" onClick={() => setLyricsOffset(0)}>RST</button>
          )}
        </div>
        <div className="fs-translation">
          {(["original", "english", "hindi", "tamil"] as TranslationLang[]).map((lang) => (
            <button
              key={lang}
              className={`fs-translation-btn ${translationLang === lang ? "fs-translation-btn-active" : ""}`}
              onClick={() => handleLangChange(lang)}
            >
              {lang === "original" ? "ORIG" : lang === "english" ? "EN" : lang === "hindi" ? "HI" : "TA"}
            </button>
          ))}
        </div>
        {translating && (
          <span className="fs-translating">TRANSLATING...</span>
        )}
      </div>

      <div
        className="fs-lyrics-scroll"
        ref={scrollRef}
        onWheel={handleLyricsWheel}
      >
        {displayLyrics.length === 0 ? (
          <div className="fs-empty">
            <Layers size={32} />
            <span className="micro-label">NO SYNCED LYRICS</span>
          </div>
        ) : (
          displayLyrics.map((line, idx) => {
            const isActive = idx === activeLineIndex;
            const dist = getLineDistance(idx);
            const lineStyles = getLineStyles(idx);
            return (
              <button
                key={idx}
                id={`fs-lyric-${idx}`}
                onClick={() => seek(line.time + lyricsOffset + 0.05)}
                className={`fs-lyric ${isActive ? "fs-lyric-active" : ""}`}
                style={lineStyles}
              >
                <span className="fs-lyric-text">{line.text}</span>
                {line.translation && (
                  <span className="fs-lyric-translation" style={{ opacity: isActive ? 0.7 : 0.3 }}>
                    {line.translation}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  const vizPanel = layout === "viz" || layout === "stacked" ? (
    <div className="fs-viz-col" ref={vizRef}>
      <Visualizer />
    </div>
  ) : null;

  return (
    <div className="fs-shell" onWheel={handleLyricsWheel}>
      <div className="fs-bg-drift" />
      {/* ── Topbar ──────────────────────────────── */}
      <div className="fs-topbar" ref={topbarRef}>
        <div className="fs-brand">
          <span className="brand-mark" aria-hidden="true">P+</span>
          <span className="micro-label">PROXIMITY+</span>
        </div>
        <div className="fs-layout-bar">
          {hasLyrics && (
            <button
              className={`fs-layout-btn ${layout === "lyrics" ? "fs-layout-btn-active" : ""}`}
              onClick={() => setLayout("lyrics")}
            >
              REC + LYR
            </button>
          )}
          <button
            className={`fs-layout-btn ${layout === "centered" ? "fs-layout-btn-active" : ""}`}
            onClick={() => setLayout("centered")}
          >
            CENTERED
          </button>
            <button
              className={`fs-layout-btn ${layout === "viz" ? "fs-layout-btn-active" : ""}`}
              onClick={() => setLayout("viz")}
            >
              REC + VIZ
            </button>
            {hasLyrics && (
              <button
                className={`fs-layout-btn ${layout === "stacked" ? "fs-layout-btn-active" : ""}`}
                onClick={() => setLayout("stacked")}
              >
                LRC + VIZ
              </button>
            )}
          </div>
        <div className="fs-topbar-right">
          <div className="fs-readout">
            <span className="micro-label">NOW SPINNING / {queueIndex + 1}</span>
            <span className="fs-readout-divider" />
            <span className="micro-label">{queue.length} CUTS LOADED</span>
          </div>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="fs-close"
              style={{ marginRight: 6 }}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}
          <button onClick={onClose} className="fs-close" aria-label="Close fullscreen">
            <ArrowDown size={16} />
          </button>
        </div>
      </div>

      {/* ── Stage ───────────────────────────────── */}
      <div
        className={`fs-stage`}
        data-mode={layout}
        style={{ "--fs-side": `${sideW}fr` } as any}
      >
        <div className="fs-side-resize-handle" onMouseDown={onResizeStart} style={{ left: `${(100 / (1 + sideW))}%` }} />

        {/* Player Column */}
        <div className="fs-player" ref={playerRef}>
          <div className="fs-turntable-glow" />
          {turntableEl}
          <h1 className="fs-title">{currentSong.title}</h1>
          <p className="fs-meta">
            {currentSong.artist}{currentSong.album ? ` \u2022 ${currentSong.album}` : ""}
          </p>
          <div className="fs-divider" />
          {playerControlsEl}
        </div>

        {/* Lyrics Column */}
        {(layout === "lyrics" || layout === "stacked") && lyricsPanel}

        {/* Visualizer Column */}
        {(layout === "viz" || layout === "stacked") && vizPanel}
      </div>

      {/* Queue drawer - slides in from right */}
      {showQueue && <QueueManager onClose={() => setShowQueue(false)} />}
    </div>
  );
};

export default FullscreenPlayer;
