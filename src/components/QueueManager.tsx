import React, { useState, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import { X, ChevronUp, ChevronDown, Trash2, Play, GripVertical, ChevronRight, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Song } from "../lib/db";

interface QueueManagerProps {
  onClose: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  songIndex: number;
  song: Song;
}

export const QueueManager: React.FC<QueueManagerProps> = ({ onClose }) => {
  const { queue, queueIndex, currentSong, setQueue, playSong, playNext, playAfter } = useAudio();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    setQueue(newQueue);
  };

  const moveSong = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queue.length) return;
    const newQueue = [...queue];
    const temp = newQueue[index];
    newQueue[index] = newQueue[targetIndex];
    newQueue[targetIndex] = temp;
    setQueue(newQueue);
  };

  const removeSongFromQueue = (index: number) => {
    if (queue.length <= 1) return;
    setQueue(queue.filter((_, idx) => idx !== index));
  };

  const clearQueueExceptCurrent = () => {
    if (!currentSong) return;
    setQueue([currentSong]);
  };

  const handleContextMenu = (e: React.MouseEvent, index: number, song: Song) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, songIndex: index, song });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

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
            <span className="micro-label">PLAY QUEUE</span>
            <span className="micro-label" style={{ color: "var(--text-muted)" }}>{queue.length} TRACKS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {queue.length > 1 && (
              <button onClick={clearQueueExceptCurrent} className="micro-label" style={{ color: "var(--text-muted)", cursor: "pointer" }}>CLEAR</button>
            )}
            <button className="drawer-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="drawer-body" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {queue.map((song, idx) => {
            const isCurrent = currentSong?.id === song.id && queueIndex === idx;
            const isDragging = dragIndex === idx;
            const isDropTarget = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
            
            return (
              <div
                key={`${song.id}-${idx}`}
                draggable={true}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== idx) setDragOverIndex(idx); }}
                onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderQueue(dragIndex, idx); setDragIndex(null); setDragOverIndex(null); }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                onContextMenu={(e) => handleContextMenu(e, idx, song)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  border: isDropTarget ? "2px dashed var(--red)" : isCurrent ? "1px solid var(--red)" : "1px solid var(--line-light)",
                  background: isDragging ? "var(--paper-2)" : "transparent",
                  cursor: "grab",
                  transition: "all 160ms ease",
                  opacity: isDragging ? 0.3 : 1,
                  boxShadow: isCurrent ? "0 0 8px var(--red)" : "none",
                }}
              >
                <GripVertical 
                  size={12} 
                  style={{ 
                    color: "var(--line-light)", 
                    flexShrink: 0,
                    transition: "color 160ms ease"
                  }} 
                  onMouseEnter={(e) => e.currentTarget.style.color = "var(--red)"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "var(--line-light)"}
                />
                <div className="sleeve" style={{ width: 32, height: 32, flexShrink: 0, position: "relative" }}>
                  {song.albumCover ? (
                    <img src={song.albumCover} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <>
                      <span className="sleeve-ring" />
                      <span className="sleeve-cross sleeve-cross-one" />
                      <span className="sleeve-cross sleeve-cross-two" />
                    </>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playSong(song, queue);
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0, 0, 0, 0.7)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0,
                      transition: "opacity 160ms ease",
                      cursor: "pointer",
                      border: "none",
                      padding: 0
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}
                  >
                    <Play size={14} style={{ color: "var(--paper)", fill: "var(--paper)" }} />
                  </button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isCurrent ? "var(--red)" : "var(--ink)" }}>{song.title}</span>
                  <span className="micro-label" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song.artist}</span>
                </div>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button onClick={() => moveSong(idx, "up")} disabled={idx === 0} style={{ padding: 2, color: "var(--text-muted)", opacity: idx === 0 ? 0.3 : 1, cursor: "pointer", background: "none", border: "none" }}><ChevronUp size={12} /></button>
                  <button onClick={() => moveSong(idx, "down")} disabled={idx === queue.length - 1} style={{ padding: 2, color: "var(--text-muted)", opacity: idx === queue.length - 1 ? 0.3 : 1, cursor: "pointer", background: "none", border: "none" }}><ChevronDown size={12} /></button>
                  <button onClick={() => removeSongFromQueue(idx)} disabled={queue.length <= 1} style={{ padding: 2, color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}><Trash2 size={10} /></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Minimal 2-button context menu */}
        {contextMenu && (
          <div
            className="context-menu animate-fade-in"
            style={{ 
              left: contextMenu.x, 
              top: contextMenu.y,
              minWidth: "120px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="context-menu-item"
              onClick={() => {
                playNext(contextMenu.song);
                setContextMenu(null);
              }}
            >
              <ChevronRight size={12} style={{ marginRight: 6 }} /> PLAY NEXT
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                playAfter(contextMenu.song);
                setContextMenu(null);
              }}
            >
              <Plus size={12} style={{ marginRight: 6 }} /> PLAY AFTER
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default QueueManager;
