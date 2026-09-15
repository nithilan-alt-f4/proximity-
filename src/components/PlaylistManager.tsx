import React, { useState, useRef } from "react";
import { useAudio } from "../context/AudioContext";
import { Plus, Trash2, Music, ChevronRight, ImagePlus, Check } from "lucide-react";
import type { Song } from "../lib/db";

const songInPlaylist = (playlist: { songIds: string[] }, songs: Song[]): Song[] => {
  const byId = new Map(songs.map((s) => [s.id, s]));
  return playlist.songIds.map((id) => byId.get(id)).filter(Boolean) as Song[];
};

export const PlaylistManager: React.FC = () => {
  const { playlists, activePlaylistId, setActivePlaylistId, createPlaylist, deletePlaylist, songs, loadPlaylists, setPlaylistCover } = useAudio();
  const [playlistName, setPlaylistName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [coverUI, setCoverUI] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    await createPlaylist(playlistName.trim());
    setPlaylistName("");
    setIsCreating(false);
  };

  const saveCover = async (cover: string) => {
    if (!activePlaylist) return;
    await setPlaylistCover(activePlaylist.id, cover);
    setCoverUI(null);
    setCoverPreview("");
  };

  const pickFromFirstSong = async () => {
    if (!activePlaylist) return;
    const listSongs = songInPlaylist(activePlaylist, songs);
    const first = (listSongs[0]?.albumCover || songs[0]?.albumCover || "");
    if (first) await saveCover(first);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setCoverPreview(dataUrl);
      saveCover(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="micro-label">PLAYLISTS</span>
        <button onClick={() => setIsCreating(!isCreating)} className="eq-profile-btn" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={12} /> NEW
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} style={{ padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="micro-label">PLAYLIST NAME</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" placeholder="My playlist..." value={playlistName} onChange={(e) => setPlaylistName(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--line)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }} />
            <button type="submit" className="save-button">CREATE</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button onClick={() => { setActivePlaylistId(null); setCoverUI(null); }}
          className={`track-row ${activePlaylistId === null ? "track-row-active" : ""}`}
          style={{ border: "1px solid var(--line-soft)", marginBottom: 4 }}>
          <Music size={14} />
          <div className="track-copy">
            <strong>All Songs</strong>
            <span>{songs.length} tracks</span>
          </div>
          <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
        </button>

        {playlists.map((playlist) => {
          const isActive = activePlaylistId === playlist.id;
          return (
            <div key={playlist.id}
              className={`track-row ${isActive ? "track-row-active" : ""}`}
              style={{ border: "1px solid var(--line-soft)", marginBottom: 4 }}>
              <button onClick={() => { setActivePlaylistId(playlist.id); setCoverUI(coverUI === playlist.id ? null : playlist.id); }} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                {playlist.cover ? (
                  <img src={playlist.cover} alt="" style={{ width: 26, height: 26, objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
                ) : (
                  <Music size={14} />
                )}
                <div className="track-copy">
                  <strong>{playlist.name}</strong>
                  <span>{playlist.songIds.length} tracks</span>
                </div>
              </button>
              <button onClick={() => deletePlaylist(playlist.id)} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {playlists.length === 0 && (
          <span className="micro-label" style={{ textAlign: "center", padding: 12, color: "var(--text-muted)" }}>NO PLAYLISTS</span>
        )}
      </div>

      {/* Cover editor for active playlist */}
      {activePlaylist && (
        <div style={{ padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10, background: "var(--paper)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="micro-label">COVER / {activePlaylist.name}</span>
            {activePlaylist.cover && <span className="micro-label" style={{ color: "var(--red)" }}><Check size={12} /> SET</span>}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 54, height: 54, border: "1px solid var(--line)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper-2)" }}>
              {coverPreview ? (
                <img src={coverPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
              ) : activePlaylist.cover ? (
                <img src={activePlaylist.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
              ) : (
                <Music size={16} style={{ color: "var(--text-muted)" }} />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button className="eq-profile-btn" style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={pickFromFirstSong}>
                <ImagePlus size={12} /> USE FIRST SONG ART
              </button>
              <button className="eq-profile-btn" style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={() => fileRef.current?.click()}>
                <ImagePlus size={12} /> UPLOAD IMAGE
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />
            </div>
          </div>

          {(songInPlaylist(activePlaylist, songs).length > 0) && (
            <div>
              <span className="micro-label" style={{ marginBottom: 6, display: "block" }}>FROM TRACKS</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {songInPlaylist(activePlaylist, songs).filter((s) => s.albumCover).map((s) => (
                  <button key={s.id} title={s.title}
                    onClick={() => saveCover(s.albumCover!)}
                    style={{ padding: 0, border: activePlaylist.cover === s.albumCover ? "2px solid var(--red)" : "1px solid var(--line)" }}>
                    <img src={s.albumCover!} alt="" style={{ width: 40, height: 40, objectFit: "cover", display: "block" }} referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default PlaylistManager;