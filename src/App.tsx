import React, { useState, useRef } from "react";
import { AudioProvider, useAudio } from "./context/AudioContext";
import { SongUploader } from "./components/SongUploader";
import { LyricsViewer } from "./components/LyricsViewer";
import { Equalizer } from "./components/Equalizer";
import { Visualizer } from "./components/Visualizer";
import { MusicPlayer } from "./components/MusicPlayer";
import { FullscreenPlayer } from "./components/FullscreenPlayer";
import { QueueManager } from "./components/QueueManager";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { TiltCard } from "./components/TiltCard";
import { Plus, X, Pause as PauseIcon, Maximize2, Trash2, Play, Pencil, Check, Music, Sun, Moon, History as HistoryIcon, ImagePlus } from "lucide-react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useTheme } from "./hooks/useTheme";
import type { Song, Playlist } from "./lib/db";

type Drawer = "queue" | "lyrics" | "eq" | "viz" | "history" | null;

/* Resolve a playlist's ordered songs */
const playlistSongs = (pl: Playlist | null | undefined, songs: Song[], allSongsFallback = false): Song[] => {
  if (!pl) return allSongsFallback ? [...songs] : [];
  const inPl = songs.filter((s) => pl.songIds.includes(s.id));
  return inPl.sort((a, b) => pl.songIds.indexOf(a.id) - pl.songIds.indexOf(b.id));
};

function Dashboard() {
  const { isFullscreen, setIsFullscreen, songs, isPlaying, currentSong, playSong, queue, queueIndex, currentTime, duration, deleteAllSongs, playlists, activePlaylistId, setActivePlaylistId, playPlaylist } = useAudio();
  const { isDark, toggleTheme } = useTheme();
  const [view, setView] = useState<"grid" | "detail">("grid");
  const [drawer, setDrawer] = useState<Drawer>(null);

  const closeDrawer = () => setDrawer(null);
  const toggleDrawer = (d: Drawer) => setDrawer((prev) => (prev === d ? null : d));

  const openPlaylist = (pl: Playlist | null) => {
    setActivePlaylistId(pl ? pl.id : null);
    setView("detail");
  };

  return (
    <>
      <main className="archive-shell">
        {/* Library app bar */}
        <header className="lib-headbar">
          <div className="lib-brand">
            <span className="brand-mark" aria-hidden="true">P+</span>
            <span className="lib-brand-name">PROXIMITY<b>+</b></span>
            <span className="micro-label lib-brand-sub">CONTROL ROOM / v2</span>
          </div>
          <div className="lib-headbar-actions">
            <span className="micro-label lib-cut-readout">
              {currentSong ? <>NOW SPINNING / <b>{queueIndex + 1}</b> · {queue.length} CUTS</> : <>{songs.length} CUTS IN ARCHIVE</>}
            </span>
            <button className="lib-action" onClick={() => toggleDrawer("eq")}><RadioIcon />EQ</button>
            <button className="lib-action" onClick={() => toggleDrawer("lyrics")}><LyricIcon />LYRICS</button>
            <button className="lib-action" onClick={() => toggleDrawer("viz")}><VizIcon />VIZ</button>
            <button className="lib-action" onClick={() => toggleDrawer("queue")}><QueueIcon />QUEUE</button>
            <button className="lib-action" onClick={() => toggleDrawer("history")}><HistoryIcon size={13} />HISTORY</button>
            <button
              className="lib-action"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button className="lib-action lib-action-danger" onClick={() => { if (confirm(`Delete ALL ${songs.length} tracks? This cannot be undone.`)) deleteAllSongs(); }}><Trash2 size={13} /></button>
            <button className="lib-action lib-action-primary" onClick={() => setView("detail")} title="Upload songs">
              <Plus size={14} /> ADD MUSIC
            </button>
            <button className="lib-action lib-action-fullscreen" onClick={() => setIsFullscreen(true)} title="Fullscreen Player">
              <Maximize2 size={14} /> FULLSCREEN
            </button>
          </div>
        </header>

        {/* Library body */}
        {view === "grid" ? (
          <PlaylistGrid
            songs={songs}
            playlists={playlists}
            activePlaylistId={activePlaylistId}
            onOpen={openPlaylist}
            onPlay={playPlaylist}
            onGoUpload={() => setView("detail")}
          />
        ) : (
          <LibraryDetail
            onBack={() => setView("grid")}
          />
        )}

        {/* Control Panel (bottom player) */}
        <MusicPlayer onOpenDrawer={toggleDrawer} />

        {/* Drawers */}
        <AnimatePresence>
          {drawer === "queue" && <QueueManager onClose={closeDrawer} />}
          {drawer === "lyrics" && <LyricsViewer onClose={closeDrawer} />}
          {drawer === "eq" && <Equalizer onClose={closeDrawer} />}
          {drawer === "viz" && <VisualizerDrawer onClose={closeDrawer} />}
          {drawer === "history" && <HistoryDrawer onClose={closeDrawer} />}
        </AnimatePresence>

        {/* Fullscreen Player */}
        <AnimatePresence>
          {isFullscreen && <FullscreenPlayer isDark={isDark} onToggleTheme={toggleTheme} onClose={() => setIsFullscreen(false)} />}
        </AnimatePresence>
      </main>
    </>
  );
}

/* ---------------- PLAYLIST GRID ---------------- */
function PlaylistGrid({ songs, playlists, activePlaylistId, onOpen, onPlay, onGoUpload }: {
  songs: Song[]; playlists: Playlist[]; activePlaylistId: string | null;
  onOpen: (pl: Playlist | null) => void; onPlay: (id: string | null) => void; onGoUpload: () => void;
}) {
  const { deletePlaylist, setPlaylistCover } = useAudio();
  const allActive = activePlaylistId === null && (songs.length > 0);
  const gridCoverInputRef = useRef<HTMLInputElement>(null);
  const gridCoverTargetRef = useRef<string | null>(null);

  const onGridCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = gridCoverTargetRef.current;
    if (!file || !targetId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl) setPlaylistCover(targetId, dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="lib-body">
      <div className="lib-body-head">
        <div>
          <span className="micro-label">COLLECTION</span>
          <h1 className="lib-h1">PLAYLISTS</h1>
        </div>
        <span className="micro-label">{playlists.length} PLAYLIST{playlists.length === 1 ? "" : "S"} / {songs.length} CUTS</span>
      </div>

      <div className="pl-grid">
        {/* All Songs card */}
        <button
          className="pl-card"
          onClick={() => { if (songs.length > 0) onOpen(null); }}
          style={{ opacity: songs.length === 0 ? 0.5 : 1, cursor: songs.length === 0 ? "default" : "pointer" }}
        >
          <div className="pl-card-cover pl-card-all">
            <div className="pl-card-all-inner">
              <span className="pl-card-all-disc">{songs.length > 0 && <span className="pl-card-all-spin" />}</span>
              <strong>ALL<br />CUTS</strong>
            </div>
          </div>
          <div className="pl-card-title"><span>ALL SONGS</span></div>
          <div className="pl-card-sub">{songs.length} TRACKS</div>
          {allActive && <span className="pl-now"><RadioIcon /> NOW SPINNING</span>}
        </button>

        {playlists.map((pl) => {
          const inPl = playlistSongs(pl, songs);
          const active = activePlaylistId === pl.id;
          return (
            <div key={pl.id} className="pl-card-wrap">
              <TiltCard className="pl-card-tilt">
                <div
                  className="pl-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (inPl.length > 0 || pl.songIds.length === 0) onOpen(pl); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (inPl.length > 0 || pl.songIds.length === 0) onOpen(pl); } }}
                >
                  <div className="pl-card-cover">
                    {pl.cover ? (
                      <img src={pl.cover} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="pl-card-cover-fallback">
                        <Music size={22} />
                        <span>{pl.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <button
                      className="pl-card-play"
                      onClick={(e) => { e.stopPropagation(); onPlay(pl.id); }}
                      title={`Play ${pl.name}`}
                    ><Play size={16} fill="currentColor" /></button>
                    <button
                      className="pl-card-cover-btn"
                      onClick={(e) => { e.stopPropagation(); gridCoverTargetRef.current = pl.id; gridCoverInputRef.current?.click(); }}
                      title={`Set cover for ${pl.name}`}
                    ><ImagePlus size={13} /></button>
                  </div>
                  <div className="pl-card-title"><span>{pl.name}</span></div>
                  <div className="pl-card-sub">{inPl.length} TRACKS</div>
                  {active && <span className="pl-now"><RadioIcon /> NOW SPINNING</span>}
                </div>
              </TiltCard>
              <button className="pl-card-del" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete playlist "${pl.name}"?`)) deletePlaylist(pl.id); }} title="Delete playlist"><Trash2 size={11} /></button>
            </div>
          );
        })}

        {/* New playlist / upload card */}
        <button className="pl-card pl-card-new" onClick={onGoUpload}>
          <div className="pl-card-cover pl-card-cover-new"><Plus size={22} /></div>
          <div className="pl-card-title"><span>ADD MUSIC</span></div>
          <div className="pl-card-sub">UPLOAD OR CREATE</div>
        </button>
      </div>

      <input ref={gridCoverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onGridCoverUpload} />
    </div>
  );
}

/* ---------------- LIBRARY DETAIL (playlist browse / upload) ---------------- */
function LibraryDetail({ onBack }: { onBack: () => void }) {
  const { playlists, activePlaylistId, songs, currentSong, playSong, isPlaying, playPlaylist, updatePlaylistDescription, createPlaylist, setPlaylistCover } = useAudio();
  const [mode, setMode] = useState<"browse" | "upload" | "new">("browse");
  const [newName, setNewName] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || null;
  const listSongs = playlistSongs(activePlaylist, songs, activePlaylistId === null);
  const tracks = activePlaylist ? listSongs : songs;

  const onCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePlaylist) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl) setPlaylistCover(activePlaylist.id, dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveDesc = async () => {
    if (activePlaylist && activePlaylist.id) {
      await updatePlaylistDescription(activePlaylist.id, descDraft);
    }
    setEditingDesc(false);
  };

  return (
    <div className="lib-body lib-detail">
      <div className="lib-detail-top">
        <button className="lib-back" onClick={onBack}><X size={14} />BACK TO PLAYLISTS</button>
        <div className="lib-detail-tabs">
          <button className={mode === "browse" ? "pl-tab pl-tab-active" : "pl-tab"} onClick={() => setMode("browse")}>BROWSE</button>
          <button className={mode === "new" ? "pl-tab pl-tab-active" : "pl-tab"} onClick={() => setMode("new")}>NEW PLAYLIST</button>
          <button className={mode === "upload" ? "pl-tab pl-tab-active" : "pl-tab"} onClick={() => setMode("upload")}>UPLOAD</button>
        </div>
      </div>

      {mode === "browse" && (
        activePlaylist ? (
          <div className="pl-detail">
            <div className="pl-detail-hero">
              <div className="pl-detail-cover">
                {activePlaylist.cover ? (
                  <img src={activePlaylist.cover} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="pl-card-cover-fallback"><Music size={34} /><span>{activePlaylist.name.charAt(0).toUpperCase()}</span></div>
                )}
              </div>
              <div className="pl-detail-info">
                <span className="micro-label">PLAYLIST / {listSongs.length} TRACKS</span>
                <h1 className="pl-detail-name">{activePlaylist.name}</h1>
                {editingDesc ? (
                  <div className="pl-desc-edit">
                    <textarea
                      autoFocus rows={2}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      placeholder="Add a description..."
                      className="pl-desc-input"
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="eq-profile-btn" onClick={saveDesc}><Check size={12} /> SAVE</button>
                      <button className="eq-profile-btn" onClick={() => setEditingDesc(false)}>CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <p className="pl-detail-desc" onClick={() => { setDescDraft(activePlaylist.description || ""); setEditingDesc(true); }}>
                    {activePlaylist.description || <span className="pl-desc-empty">+ ADD DESCRIPTION</span>}
                  </p>
                )}
                {!editingDesc && (
                  <button className="eq-profile-btn pl-desc-edit-btn" onClick={() => { setDescDraft(activePlaylist.description || ""); setEditingDesc(true); }}>
                    <Pencil size={11} /> EDIT
                  </button>
                )}
                <div className="pl-detail-actions">
                  <button className="merge-btn merge-play" onClick={() => playPlaylist(activePlaylist.id)}><Play size={16} fill="currentColor" /> PLAY PLAYLIST</button>
                  <span className="micro-label">SHUFFLE OFF · ORDER AS LISTED</span>
                </div>
                <div className="pl-cover-bar">
                  <button className="eq-profile-btn" onClick={() => coverInputRef.current?.click()}>
                    <ImagePlus size={12} /> UPLOAD COVER IMAGE
                  </button>
                  <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onCoverUpload} />
                  {(() => {
                    const covers = Array.from(new Set(listSongs.filter((s) => s.albumCover).map((s) => s.albumCover as string)));
                    if (covers.length === 0) return null;
                    return (
                      <div className="pl-cover-source">
                        <span className="micro-label">OR PICK:</span>
                        {covers.map((c) => (
                          <button key={c} className={`pl-cover-pick ${activePlaylist.cover === c ? "pl-cover-pick-on" : ""}`} onClick={() => setPlaylistCover(activePlaylist.id, c)} title="Use this artwork">
                            <img src={c} alt="" referrerPolicy="no-referrer" />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="library-columns" aria-hidden="true">
              <span className="micro-label">#</span>
              <span className="micro-label">RELEASE / ARTIST</span>
              <span className="micro-label">TIME</span>
            </div>
            <div className="track-list pl-track-list">
              {tracks.length === 0 && (
                <div className="empty-state"><span className="micro-label">NO TRACKS IN THIS PLAYLIST</span></div>
              )}
              {tracks.map((song, idx) => {
                const active = currentSong?.id === song.id;
                return (
                  <button key={song.id} className={`track-row ${active ? "track-row-active" : ""}`}
                    onClick={() => playSong(song, tracks)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, song }); }}>
                    <div className="track-index">
                      <span>{active && isPlaying ? "▸" : String(idx + 1).padStart(2, "0")}</span>
                      {active && <span className="active-bar" />}
                    </div>
                    <div className="sleeve">
                      {song.albumCover ? (
                        <img src={song.albumCover} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <><span className="sleeve-ring" /><span className="sleeve-cross sleeve-cross-one" /><span className="sleeve-cross sleeve-cross-two" /></>
                      )}
                    </div>
                    <div className="track-copy">
                      <strong>{song.title}</strong>
                      <span>{song.artist}{song.album ? ` / ${song.album}` : ""}</span>
                    </div>
                    <div className="track-time"><span className="micro-label">{formatTime(song.duration)}</span></div>
                    {active ? <PauseIcon size={14} style={{ color: "var(--red)" }} /> : null}
                  </button>
                );
              })}
            </div>
            {contextMenu && (
              <ContextMenuSimple x={contextMenu.x} y={contextMenu.y} song={contextMenu.song} onClose={() => setContextMenu(null)} />
            )}
          </div>
        ) : (
          <div className="pl-detail pl-empty-all">
            <h1 className="pl-detail-name">ALL SONGS</h1>
            <p className="pl-detail-desc">{songs.length} tracks across your archive. Browse and play anything.</p>
            <button className="merge-btn merge-play" onClick={() => playPlaylist(null)}><Play size={16} fill="currentColor" /> PLAY ALL</button>
            <div className="library-columns" aria-hidden="true">
              <span className="micro-label">#</span>
              <span className="micro-label">RELEASE / ARTIST</span>
              <span className="micro-label">TIME</span>
            </div>
            <div className="track-list pl-track-list">
              {tracks.map((song, idx) => {
                const active = currentSong?.id === song.id;
                return (
                  <button key={song.id} className={`track-row ${active ? "track-row-active" : ""}`}
                    onClick={() => playSong(song, songs)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, song }); }}>
                    <div className="track-index"><span>{active && isPlaying ? "▸" : String(idx + 1).padStart(2, "0")}</span>{active && <span className="active-bar" />}</div>
                    <div className="sleeve">
                      {song.albumCover ? <img src={song.albumCover} alt="" referrerPolicy="no-referrer" /> : <><span className="sleeve-ring" /><span className="sleeve-cross sleeve-cross-one" /><span className="sleeve-cross sleeve-cross-two" /></>}
                    </div>
                    <div className="track-copy"><strong>{song.title}</strong><span>{song.artist}{song.album ? ` / ${song.album}` : ""}</span></div>
                    <div className="track-time"><span className="micro-label">{formatTime(song.duration)}</span></div>
                    {active ? <PauseIcon size={14} style={{ color: "var(--red)" }} /> : null}
                  </button>
                );
              })}
            </div>
            {contextMenu && <ContextMenuSimple x={contextMenu.x} y={contextMenu.y} song={contextMenu.song} onClose={() => setContextMenu(null)} />}
          </div>
        )
      )}

      {mode === "new" && (
        <NewPlaylistForm name={newName} setName={setNewName} onCreate={async (n) => { await createPlaylist(n); setNewName(""); setMode("browse"); }} />
      )}

      {mode === "upload" && (
        <div className="drawer-body"><SongUploader /></div>
      )}
    </div>
  );
}

function NewPlaylistForm({ name, setName, onCreate }: { name: string; setName: (v: string) => void; onCreate: (n: string) => Promise<void> }) {
  return (
    <div className="pl-new">
      <span className="micro-label">NEW PLAYLIST</span>
      <h1 className="pl-detail-name">NAME YOUR PLAYLIST</h1>
      <form
        className="pl-new-form"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}
        style={{ display: "flex", gap: 8, marginTop: 12 }}
      >
        <input type="text" placeholder="My playlist..." value={name} onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }} />
        <button type="submit" className="merge-btn merge-play">CREATE</button>
      </form>
    </div>
  );
}

/* Context Menu */
function ContextMenuSimple({ x, y, song, onClose }: { x: number; y: number; song: Song; onClose: () => void }) {
  const { playSong, playNext, addToQueue, deleteSong, songs } = useAudio();
  React.useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [onClose]);

  return (
    <div className="context-menu animate-fade-in" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <button className="context-menu-item" onClick={() => { playSong(song, songs); onClose(); }}>▶ PLAY</button>
      <button className="context-menu-item" onClick={() => { playNext(song); onClose(); }}>→ PLAY NEXT</button>
      <button className="context-menu-item" onClick={() => { addToQueue(song); onClose(); }}>+ ADD TO QUEUE</button>
      <div className="context-menu-divider" />
      <button className="context-menu-item" style={{ color: "var(--red)" }} onClick={() => { if (confirm(`Delete "${song.title}"?`)) deleteSong(song.id); onClose(); }}>✕ DELETE</button>
    </div>
  );
}

/* Visualizer Drawer */
function VisualizerDrawer({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel animate-slide-in">
        <div className="drawer-header">
          <span className="micro-label">SPECTRUM ANALYSIS</span>
          <button className="drawer-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="drawer-body" style={{ padding: 0 }}><Visualizer /></div>
      </div>
    </>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/* Tiny icon components to avoid dependency churn */
const RadioIcon = () => (<span style={{ display: "inline-flex", width: 12, height: 12, alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></span>);
const LyricIcon = () => (<span style={{ display: "inline-flex", width: 12, height: 12, alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V4"/><path d="M20 20H4"/></svg></span>);
const VizIcon = () => (<span style={{ display: "inline-flex", width: 12, height: 12, alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="3.5" height="9"/><rect x="10.2" y="7" width="3.5" height="14"/><rect x="17.4" y="10" width="3.5" height="11"/></svg></span>);
const QueueIcon = () => (<span style={{ display: "inline-flex", width: 12, height: 12, alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg></span>);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AudioProvider>
        <Dashboard />
      </AudioProvider>
    </MotionConfig>
  );
}
