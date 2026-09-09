import React, { useState, useRef, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import audioDb, { Song } from "../lib/db";
import jsmediatags from "jsmediatags";
import { Upload, Music, Trash2, Play, Save, Folder, FileText } from "lucide-react";

interface StagedFile {
  file: File;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  duration: number;
  isIdentifying: boolean;
  editedFields?: { title?: boolean; artist?: boolean; album?: boolean; albumCover?: boolean; };
  /** id of the staging group this file belongs to (one group per dropped folder, plus a loose-files bucket). */
  groupId: string;
}

type GroupTargetOption = "none" | "new" | "existing";

interface StageGroup {
  id: string;
  name: string;
  isFolder: boolean;
}

interface GroupTarget {
  option: GroupTargetOption;
  playlistId: string;
  newName: string;
}

const LOOSE_GROUP_ID = "loose";

const traverseFileTree = async (entry: any): Promise<File[]> => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file: File) => resolve([file]), () => resolve([]));
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const allFiles: File[] = [];
      const readEntries = () => {
        dirReader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) { resolve(allFiles); }
          else {
            const promises = entries.map((e: any) => traverseFileTree(e));
            const results = await Promise.all(promises);
            for (const files of results) allFiles.push(...files);
            readEntries();
          }
        }, () => resolve(allFiles));
      };
      readEntries();
    } else { resolve([]); }
  });
};

// A file's embedded tags only count as "useful" when they are actually clean and complete:
// BOTH a real title AND a real artist, free of the track numbers / downloader clutter /
// video-rip noise these MP3s normally carry. Anything partial, numbered or cluttered must
// go through the Groq filename-resolution pipeline instead (that's why the GitHub version
// was more accurate — it never trusted the tags blindly).
const isUsefulId3 = (id3: { title: string; artist: string; album: string; albumCover: string }): boolean => {
  const t = (id3.title || "").trim();
  const a = (id3.artist || "").trim();

  // Need a real title AND a real artist. Partial tags (e.g. only a title, no artist)
  // mean Groq has to resolve the rest — this fixes the "everything is Unknown Artist" case.
  if (t.length < 2 || a.length < 2) return false;

  // Video-rip / downloader clutter commonly baked straight into ID3 tags.
  if (/\((official|official\s*video|official\s*music\s*video|music\s*video|lyric\s*video|lyrics?|hd|4k|8k|full\s*song|video|audio)\)/i.test(t)) return false;
  if (/\b(320kbps|256kbps|128kbps|\d+\s*kbps|masstamilan|isaimini|starmusiq|sensongsmp3|pagalworld|djpunjab|mr\.?\s*jatt|y2mate|yt(mp3|audio)|mp3juices|odessa|songsmp3|123musiq|tamilanda)\b/i.test(`${t} ${a}`)) return false;

  // Leading track/sequence number ("01 - Song Name", "04. Title", "1_ ...") — not a clean title.
  if (/^\s*\d+\s*[-_.:]\s*/.test(t)) return false;

  return true;
};

// Read ID3 tags from an MP3 file using jsmediatags
const readId3Tags = (file: File): Promise<{ title: string; artist: string; album: string; albumCover: string }> => {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag: any) => {
        const tags = tag.tags || {};
        const title = tags.title || "";
        const artist = tags.artist || "";
        const album = tags.album || "";

        // Extract album cover from APIC frame
        let albumCover = "";
        if (tags.picture) {
          const pic = tags.picture;
          const bytes = new Uint8Array(pic.data);
          const binary = bytes.reduce((acc: string, byte: number) => acc + String.fromCharCode(byte), "");
          const base64 = btoa(binary);
          albumCover = `data:${pic.format};base64,${base64}`;
        }

        resolve({ title, artist, album, albumCover });
      },
      onError: () => {
        resolve({ title: "", artist: "", album: "", albumCover: "" });
      },
    });
  });
};

// Clean downloader prefixes from filename as fallback
const cleanFilename = (filename: string): { title: string; artist: string } => {
  let base = filename
    .replace(/\.(mp3|wav|m4a|flac|aac|ogg|wma)$/i, "")
    .replace(/(y2mate|youtube|spotify|soundcloud)\s*[-_]?\s*/gi, "")
    .replace(/\b(320kbps|128kbps|256kbps|vbr|kbps|hq|hd|flac|mp3|m4a|cd|remaster|remastered|mono|stereo)\b/gi, "")
    .replace(/\s*[([].*?(official|video|audio|lyrics|lyric|hd|mp3|320|kbps|hq|remaster|remastered|music video|lyric video|original mix).*?[\])]/gi, "")
    .replace(/\s*(official|video|audio|lyrics|lyric|video clip|music video|full song|original mix)\s*/gi, "")
    .replace(/^\s*\d+[\s.-_]+/, "")
    .trim();

  const splitters = [" - ", " -", "- ", "-", " | ", "|", " ~ ", "~"];
  for (const splitter of splitters) {
    if (base.includes(splitter)) {
      const parts = base.split(splitter);
      return { artist: parts[0].trim(), title: parts.slice(1).join(splitter).trim() };
    }
  }
  return { artist: "Unknown Artist", title: base.trim() };
};

export const SongUploader: React.FC = () => {
  const { songs, playlists, playSong, deleteSong, addSongToPlaylist, loadSongs, loadPlaylists, playNext, addToQueue } = useAudio();
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  // Live mirror of stagedFiles so debounced async callbacks (re-identify) always read
  // the latest values without hitting stale closures.
  const stagedFilesRef = useRef<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // One staging group per dropped folder (plus a single loose-files bucket).
  // Each group carries its own independent playlist target so multiple folders
  // can be assigned to different playlists in separate metadata boxes.
  const [groups, setGroups] = useState<StageGroup[]>([]);
  const [groupTargets, setGroupTargets] = useState<Record<string, GroupTarget>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const reGuessTimeoutRef = useRef<any>(null);

  const processFile = async (file: File): Promise<StagedFile> => {
    const getDuration = (): Promise<number> => {
      return new Promise((resolve) => {
        const tempAudio = new Audio();
        const objectUrl = URL.createObjectURL(file);
        tempAudio.src = objectUrl;
        tempAudio.addEventListener("loadedmetadata", () => { resolve(tempAudio.duration || 0); URL.revokeObjectURL(objectUrl); });
        tempAudio.addEventListener("error", () => { resolve(0); URL.revokeObjectURL(objectUrl); });
      });
    };
    const duration = await getDuration();
    const fallback = cleanFilename(file.name);
    return { file, title: fallback.title, artist: fallback.artist, album: "Unknown Album", albumCover: "", duration, isIdentifying: true, editedFields: {}, groupId: "" };
  };

  const ensureGroup = (name: string, isFolder: boolean, created: Record<string, string>): string => {
    const key = (isFolder ? "F:" : "L:") + name;
    if (created[key]) return created[key];
    // Single shared loose-files bucket â€” reuse it if it already exists.
    if (!isFolder && groups.some((g) => g.id === LOOSE_GROUP_ID)) {
      created[key] = LOOSE_GROUP_ID;
      return LOOSE_GROUP_ID;
    }
    const id = isFolder ? "grp_" + Math.random().toString(36).substr(2, 9) : LOOSE_GROUP_ID;
    created[key] = id;
    setGroups((prev) => [...prev, { id, name, isFolder }]);
    setGroupTargets((prev) => ({
      ...prev,
      // Folders: default to "New Playlist..." pre-filled with the folder name so the
      // user just confirms it â€” we do NOT auto-create a playlist behind the scenes.
      [id]: isFolder ? { option: "new", playlistId: "", newName: name } : { option: "none", playlistId: "", newName: "" },
    }));
    return id;
  };

  const ensureLooseGroup = (): string => {
    if (!groups.some((g) => g.id === LOOSE_GROUP_ID)) {
      setGroups((prev) => [...prev, { id: LOOSE_GROUP_ID, name: "Loose Files", isFolder: false }]);
      setGroupTargets((prev) => ({ ...prev, [LOOSE_GROUP_ID]: { option: "none", playlistId: "", newName: "" } }));
    }
    return LOOSE_GROUP_ID;
  };

  const handleFilesList = async (files: File[], groupId: string, groupName?: string) => {
    const mp3Files = files.filter((file) => file.type === "audio/mpeg" || file.name.endsWith(".mp3"));
    if (mp3Files.length === 0) return;
    setIsUploading(true);
    setUploadProgressMsg(groupName ? `Reading metadata from "${groupName}"...` : "Reading MP3 metadata...");
    const initialStaged = await Promise.all(mp3Files.map(async (f) => { const st = await processFile(f); st.groupId = groupId; return st; }));
    setStagedFiles((prev) => [...prev, ...initialStaged]);
    setIsUploading(false);

// Identify metadata in PARALLEL — one song per Groq key.
    // Batching exactly N songs at once (N = number of GROQ_API_KEYS on the server) ensures
    // every key is busy on a different song simultaneously.
    const PARALLEL_IDENTIFY = 3; // matches the 3 GROQ_API_KEYS configured on the server

    const identifyStagedFile = async (current: StagedFile) => {
      const id3 = await readId3Tags(current.file);

      // If the file has usable ID3 metadata, use it directly — no AI needed
      let finalTitle = id3.title || current.title;
      let finalArtist = id3.artist || current.artist;
      let finalAlbum = id3.album || current.album;
      let finalAlbumCover = id3.albumCover || current.albumCover;

      // Groq fires as soon as the embedded metadata is NOT comfortably useful — partial,
      // missing-artist, track-number-prefixed or cluttered tags go to the AI pipeline.
      if (!isUsefulId3(id3)) {
        try {
          const res = await fetch("/api/songs/identify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: current.file.name }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.title) finalTitle = data.title;
            if (data.artist) finalArtist = data.artist;
            if (data.album) finalAlbum = data.album;
            if (data.albumCover) finalAlbumCover = data.albumCover;
          }
        } catch (e) {
          console.warn("Groq metadata fallback failed:", e);
        }
      }

      setStagedFiles((prev) => prev.map((st) => {
        if (st.file !== current.file) return st;
        return {
          ...st,
          title: finalTitle,
          artist: finalArtist,
          album: finalAlbum,
          albumCover: finalAlbumCover,
          isIdentifying: false,
        };
      }));
    };

    for (let i = 0; i < initialStaged.length; i += PARALLEL_IDENTIFY) {
      await Promise.all(initialStaged.slice(i, i + PARALLEL_IDENTIFY).map(identifyStagedFile));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const gid = ensureLooseGroup();
    handleFilesList(Array.from(files), gid, "Loose Files");
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const items = e.dataTransfer.items;
    if (!items) {
      if (e.dataTransfer.files) { const gid = ensureLooseGroup(); await handleFilesList(Array.from(e.dataTransfer.files), gid, "Loose Files"); }
      return;
    }
    const folderPromises: Promise<{ folderName: string; files: File[] }>[] = [];
    const looseFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
        if (entry) {
          if (entry.isDirectory) {
            folderPromises.push((async () => { const traversed = await traverseFileTree(entry); return { folderName: entry.name, files: traversed.filter((f: File) => f.type === "audio/mpeg" || f.name.endsWith(".mp3")) }; })());
          } else {
            const file = item.getAsFile();
            if (file && (file.type === "audio/mpeg" || file.name.endsWith(".mp3"))) looseFiles.push(file);
          }
        } else {
          const file = item.getAsFile();
          if (file && (file.type === "audio/mpeg" || file.name.endsWith(".mp3"))) looseFiles.push(file);
        }
      }
    }
    const folders = await Promise.all(folderPromises);
    const foldersWithMp3s = folders.filter((f) => f.files.length > 0);
    // Each dropped folder becomes its own staging group (separate metadata box) so it
    // can be assigned to a different playlist. Loose files go into a shared "Loose Files" box.
    const created: Record<string, string> = {};
    if (looseFiles.length > 0) {
      const gid = ensureGroup("Loose Files", false, created);
      await handleFilesList(looseFiles, gid, "Loose Files");
    }
    for (const folder of foldersWithMp3s) {
      const gid = ensureGroup(folder.folderName, true, created);
      await handleFilesList(folder.files, gid, folder.folderName);
    }
  };

  // Debounced interactive refinement: after Groq's initial pass, manually correcting any
  // field (e.g. typing in the artist name) re-runs Groq with that field as a CONFIRMED hint
  // (ground truth). Groq then fixes/backfills only the fields the user did NOT touch —
  // exactly matching the re-run-with-context behavior of the reference implementation.
  const triggerReIdentify = (index: number) => {
    if (reGuessTimeoutRef.current) clearTimeout(reGuessTimeoutRef.current);
    reGuessTimeoutRef.current = setTimeout(async () => {
      // Pull the LATEST row by file reference (the array may shift if another song is saved meanwhile).
      const snapshot = stagedFilesRef.current;
      const file = snapshot[index]?.file;
      if (!file) return;
      const target = snapshot.find((st) => st.file === file);
      if (!target || target.isIdentifying) return;

      // Send ONLY the fields the user actually edited as confirmation hints.
      const stEdited = target.editedFields || {};
      const hints: { title?: string; artist?: string; album?: string } = {};
      if (stEdited.title && target.title.trim()) hints.title = target.title.trim();
      if (stEdited.artist && target.artist.trim()) hints.artist = target.artist.trim();
      if (stEdited.album && target.album.trim()) hints.album = target.album.trim();
      if (!hints.title && !hints.artist && !hints.album) return;

      console.log(`[Re-identify] Manual correction -> Groq refine with confirmed hints:`, hints);
      try {
        const res = await fetch("/api/songs/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: target.file.name, ...hints }),
        });
        if (res.ok) {
          const data = await res.json();
          setStagedFiles((prev) => prev.map((st) => {
            if (st.file !== file) return st;
            const sEdited = st.editedFields || {};
            return {
              ...st,
              // User-typed fields are NEVER overwritten — Groq fills/refines the rest.
              title: sEdited.title ? st.title : (data.title || st.title),
              artist: sEdited.artist ? st.artist : (data.artist || st.artist),
              album: sEdited.album ? st.album : (data.album || st.album),
              albumCover: data.albumCover || st.albumCover,
            };
          }));
        }
      } catch (e) {
        console.warn("Metadata refine failed:", e);
      }
    }, 900);
  };

  const handleInputChange = (index: number, field: "title" | "artist" | "album", value: string) => {
    setStagedFiles((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const edited = current.editedFields || {};
      updated[index] = { ...current, [field]: value, editedFields: { ...edited, [field]: true } };
      return updated;
    });
    // After a manual correction settles, re-run Groq with the corrected field(s) as context.
    triggerReIdentify(index);
  };

  // Resolve the playlist a group is assigned to (per its own dropdown). Creates a new
  // playlist only when the box selected "+ New Playlist" (name pre-filled with folder name).
  const resolveGroupTargetId = async (groupId: string): Promise<string> => {
    const t = groupTargets[groupId];
    if (!t) return "";
    if (t.option === "existing" && t.playlistId) return t.playlistId;
    if (t.option === "new" && t.newName.trim()) {
      const name = t.newName.trim();
      let pl = playlists.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (pl) return pl.id;
      const id = "pl_" + Math.random().toString(36).substr(2, 9);
      await audioDb.savePlaylist({ id, name: name, songIds: [], createdAt: Date.now() });
      await loadPlaylists();
      return id;
    }
    return "";
  };

  // Import a single staged file: look up lyrics, persist the song, optionally add to a playlist.
  const importStagedSong = async (staged: StagedFile, targetPlaylistId: string) => {
    setUploadProgressMsg(`Importing "${staged.title || staged.file.name}"...`);
    let finalLyrics = "", finalSynced: any[] = [];
    let finalTitle = (staged.title || "").trim();
    let finalArtist = (staged.artist || "Unknown Artist").trim();
    let finalAlbum = (staged.album || "Unknown Album").trim();
    let finalAlbumCover = staged.albumCover || "";
    try {
      const res = await fetch("/api/lyrics/find", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: staged.title || staged.file.name.replace(/\.[^/.]+$/, ""), artist: staged.artist === "Unknown Artist" ? "" : staged.artist, duration: staged.duration, originalFilename: staged.file.name }),
      });
      if (res.ok) {
        const lyricData = await res.json();
        finalLyrics = lyricData.lyrics || "";
        finalSynced = (lyricData.syncedLyrics || []).map((l: any) => ({ time: parseFloat(l.time) || 0, text: String(l.text || "") })).sort((a: any, b: any) => a.time - b.time);
        // Backfill title/artist from lyric lookup ONLY when the user never manually
        // corrected those fields — a manual correction is ground truth.
        const stEdited = staged.editedFields || {};
        if (!stEdited.title && lyricData.title?.trim()) finalTitle = lyricData.title.trim();
        if (!stEdited.artist && lyricData.artist?.trim()) finalArtist = lyricData.artist.trim();
      }
    } catch (e) { console.warn("Auto-lyric search failed:", e); }
    if (!finalTitle) finalTitle = staged.file.name.replace(/\.[^/.]+$/, "");
    else finalTitle = finalTitle.replace(/\.[^/.]+$/, "");
    const newSong: Song = { id: "song_" + Math.random().toString(36).substr(2, 9), title: finalTitle, artist: finalArtist, album: finalAlbum, albumCover: finalAlbumCover, duration: staged.duration, lyrics: finalLyrics, syncedLyrics: finalSynced, audioBlob: staged.file, createdAt: Date.now() };
    await audioDb.saveSong(newSong);
    if (targetPlaylistId) await addSongToPlaylist(newSong.id, targetPlaylistId);
  };

  const saveStagedSong = async (index: number) => {
    const staged = stagedFiles[index];
    if (!staged) return;
    setIsUploading(true);
    const targetPlaylistId = await resolveGroupTargetId(staged.groupId);
    await importStagedSong(staged, targetPlaylistId);
    const remainingInGroup = stagedFiles.filter((s) => s.groupId === staged.groupId && s !== staged).length;
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
    if (remainingInGroup === 0) {
      setGroups((prev) => prev.filter((g) => g.id !== staged.groupId));
      setGroupTargets((prev) => { const next = { ...prev }; delete next[staged.groupId]; return next; });
    }
    setIsUploading(false);
    await loadSongs();
    await loadPlaylists();
  };

  // Per-box SAVE ALL: import every file in one folder's box to that box's assigned playlist.
  const saveGroup = async (groupId: string) => {
    const groupFiles = stagedFiles.filter((s) => s.groupId === groupId);
    if (groupFiles.length === 0) return;
    setIsUploading(true);
    const targetPlaylistId = await resolveGroupTargetId(groupId);
    for (let i = 0; i < groupFiles.length; i++) {
      setUploadProgressMsg(`Importing "${groupFiles[i].title || groupFiles[i].file.name}" (${i + 1}/${groupFiles.length})...`);
      await importStagedSong(groupFiles[i], targetPlaylistId);
    }
    setStagedFiles((prev) => prev.filter((s) => s.groupId !== groupId));
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setGroupTargets((prev) => { const next = { ...prev }; delete next[groupId]; return next; });
    setIsUploading(false);
    await loadSongs();
    await loadPlaylists();
  };

  const saveAllStagedSongs = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    const total = stagedFiles.length;
    const groupIds: string[] = Array.from(new Set(stagedFiles.map((s) => s.groupId)));
    let processed = 0;
    for (const gid of groupIds) {
      const targetPlaylistId = await resolveGroupTargetId(gid);
      const groupFiles = stagedFiles.filter((s) => s.groupId === gid);
      for (const staged of groupFiles) {
        processed++;
        setUploadProgressMsg(`Importing "${staged.title || staged.file.name}" (${processed}/${total})...`);
        await importStagedSong(staged, targetPlaylistId);
      }
    }
    setStagedFiles([]);
    setGroups([]);
    setGroupTargets({});
    setIsUploading(false);
    await loadSongs();
    await loadPlaylists();
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  useEffect(() => { stagedFilesRef.current = stagedFiles; }, [stagedFiles]);

  useEffect(() => { return () => { if (reGuessTimeoutRef.current) clearTimeout(reGuessTimeoutRef.current); }; }, []);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`upload-zone ${isDraggingOver ? "upload-zone-drag" : ""}`}
      >
        <input ref={fileInputRef} type="file" accept="audio/mp3, audio/mpeg" multiple onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} />
        <Upload size={20} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>Drag & drop music files or folders</span>
        <span className="micro-label">MP3 ONLY â€” METADATA READ FROM ID3 TAGS â€” FOLDERS AUTO-CONVERT TO PLAYLISTS</span>
      </div>

      {isUploading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: "1px solid var(--line)", background: "var(--paper-2)" }}>
          <div style={{ width: 12, height: 12, border: "1px solid var(--line)", borderTop: "2px solid var(--red)", animation: "spin-record 1s linear infinite" }} />
          <span className="micro-label">{uploadProgressMsg}</span>
        </div>
      )}

      {/* Staging Area */}
      {stagedFiles.length > 0 && (
        <div style={{ padding: 12, border: "1px solid var(--line)", background: "var(--paper-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span className="micro-label">METADATA QUEUE ({stagedFiles.length} PENDING)</span>
            <button onClick={saveAllStagedSongs} disabled={isUploading} className="save-button" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Save size={12} /> SAVE ALL
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {groups.map((group) => {
              const groupFiles = stagedFiles.filter((s) => s.groupId === group.id);
              if (groupFiles.length === 0) return null;
              const target = groupTargets[group.id] || { option: "none", playlistId: "", newName: "" };
              return (
                <div key={group.id} style={{ padding: 10, border: "1px solid var(--line)", background: "var(--paper)" }}>
                  {/* Box header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      {group.isFolder ? <Folder size={12} style={{ flexShrink: 0, color: "var(--red)" }} /> : <FileText size={12} style={{ flexShrink: 0, color: "var(--text-muted)" }} />}
                      <span className="micro-label" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {group.name.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>({groupFiles.length} FILES)</span>
                    </div>
                    <button onClick={() => saveGroup(group.id)} disabled={isUploading} className="save-button" style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <Save size={12} /> SAVE ALL
                    </button>
                  </div>

                  {/* Per-box independent playlist target */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <span className="micro-label">ASSIGN TO:</span>
                    <select
                      value={target.option === "existing" ? target.playlistId : target.option}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGroupTargets((prev) => {
                          const cur = prev[group.id] || { option: "none", playlistId: "", newName: "" };
                          if (val === "none") return { ...prev, [group.id]: { ...cur, option: "none", playlistId: "" } };
                          if (val === "new") return { ...prev, [group.id]: { ...cur, option: "new", playlistId: "" } };
                          return { ...prev, [group.id]: { ...cur, option: "existing", playlistId: val } };
                        });
                      }}
                      style={{ padding: "4px 8px", border: "1px solid var(--line)", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }}>
                      <option value="none">Library Only</option>
                      <option value="new">+ New Playlist</option>
                      {playlists.map((pl) => (<option key={pl.id} value={pl.id}>{pl.name}</option>))}
                    </select>
                    {target.option === "new" && (
                      <input type="text" placeholder="Playlist name..." value={target.newName}
                        onChange={(e) => setGroupTargets((prev) => ({ ...prev, [group.id]: { ...(prev[group.id] || { option: "new", playlistId: "", newName: "" }), newName: e.target.value } }))}
                        style={{ padding: "4px 8px", border: "1px solid var(--line)", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", background: "var(--paper)", width: 160 }} />
                    )}
                  </div>

                  {/* Files in this group */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                    {groupFiles.map((staged) => {
                      const idx = stagedFiles.indexOf(staged);
                      return (
                        <div key={idx} style={{ padding: 8, border: "1px solid var(--line)", background: "var(--paper)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div className="sleeve" style={{ width: 32, height: 32, flexShrink: 0 }}>
                              {staged.albumCover ? (
                                <img src={staged.albumCover} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <>
                                  <span className="sleeve-ring" />
                                  <span className="sleeve-cross sleeve-cross-one" />
                                  <span className="sleeve-cross sleeve-cross-two" />
                                </>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staged.file.name}</span>
                              <span className="micro-label">MP3 / {formatDuration(staged.duration)}</span>
                            </div>
                          </div>
                          {staged.isIdentifying ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 6 }}>
                              <div style={{ width: 10, height: 10, border: "1px solid var(--line)", borderTop: "2px solid var(--red)", animation: "spin-record 1s linear infinite" }} />
                              <span className="micro-label">READING ID3 TAGS...</span>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input type="text" value={staged.title} onChange={(e) => handleInputChange(idx, "title", e.target.value)} placeholder="Title"
                                style={{ flex: 1, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }} />
                              <input type="text" value={staged.artist} onChange={(e) => handleInputChange(idx, "artist", e.target.value)} placeholder="Artist"
                                style={{ flex: 1, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }} />
                              <input type="text" value={staged.album} onChange={(e) => handleInputChange(idx, "album", e.target.value)} placeholder="Album"
                                style={{ flex: 1, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }} />
                              <button onClick={() => saveStagedSong(idx)} disabled={isUploading} className="save-button">SAVE</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
export default SongUploader;
