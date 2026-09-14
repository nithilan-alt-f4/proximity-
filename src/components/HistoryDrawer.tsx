import React from "react";
import { useAudio } from "../context/AudioContext";
import { X, History as HistoryIcon, Trash2, Play, Disc3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { PlayHistoryEntry } from "../lib/db";

interface HistoryDrawerProps {
  onClose: () => void;
}

const fmtTime = (ms: number): string => {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = d.getHours();
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? "AM" : "PM";
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${h12}:${mm} ${ampm}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${h12}:${mm} ${ampm}`;
};

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ onClose }) => {
  const { playHistory, clearPlayHistory, songs, playSong } = useAudio();

  const replayEntry = (entry: PlayHistoryEntry) => {
    // Replay from the live library when the song still exists; otherwise
    // the row stays as a metadata-only memory.
    const song = songs.find((s) => s.id === entry.songId);
    if (song) playSong(song);
  };

  return (
    <AnimatePresence>
      <div className="drawer-overlay" onClick={onClose} />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="drawer-panel"
      >
        <div className="drawer-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="micro-label">NOW PLAYING LOG</span>
            <span className="micro-label" style={{ color: "var(--text-muted)" }}>{playHistory.length} PLAYS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {playHistory.length > 0 && (
              <button
                onClick={() => { if (confirm("Clear the entire play log?")) clearPlayHistory(); }}
                className="micro-label"
                style={{ color: "var(--text-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                title="Clear play log"
              >
                <Trash2 size={11} /> CLEAR
              </button>
            )}
            <button className="drawer-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="drawer-body" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {playHistory.length === 0 ? (
            <div className="hist-empty">
              <HistoryIcon size={26} />
              <span className="micro-label">LOG EMPTY — PLAY SOMETHING</span>
              <span className="micro-label" style={{ color: "var(--text-muted)", fontSize: 9 }}>
                Every track you start lands here with its cover, artist and album.
              </span>
            </div>
          ) : (
            playHistory.map((entry) => {
              const exists = songs.some((s) => s.id === entry.songId);
              return (
                <div key={entry.id} className="hist-row" style={{ opacity: exists ? 1 : 0.62 }}>
                  <div className="hist-cover">
                    {entry.albumCover ? (
                      <img src={entry.albumCover} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="hist-cover-fallback"><Disc3 size={14} /></span>
                    )}
                  </div>
                  <div className="hist-meta">
                    <span className="hist-title" title={entry.title}>{entry.title}</span>
                    <span className="hist-sub" title={`${entry.artist}${entry.album ? " — " + entry.album : ""}`}>
                      {entry.artist}{entry.album ? ` — ${entry.album}` : ""}
                    </span>
                  </div>
                  <span className="micro-label hist-when">{fmtTime(entry.playedAt)}</span>
                  <button
                    className="hist-play"
                    onClick={() => replayEntry(entry)}
                    disabled={!exists}
                    title={exists ? "Play again" : "No longer in library"}
                    aria-label={exists ? `Play ${entry.title} again` : `${entry.title} is no longer in the library`}
                  >
                    <Play size={12} fill="currentColor" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
