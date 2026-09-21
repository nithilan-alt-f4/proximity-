export interface SyncedLyricLine {
  time: number; // in seconds
  text: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumCover?: string;
  duration: number; // in seconds
  lyrics: string;
  syncedLyrics: SyncedLyricLine[];
  audioBlob: Blob;
  eqProfileId?: string;
  createdAt: number;
}

export interface PlaylistCreatorTag {
  createdBy: string;
  createdAt: number;
  deviceId: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songIds: string[];
  cover?: string;
  createdAt: number;
  creatorTag?: PlaylistCreatorTag;
}

export interface EqProfile {
  id: string;
  name: string;
  gains: number[]; // 10 bands: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
  isPreset: boolean;
}

/**
 * One row per playback start ("now playing" / scrobble entry).
 * Stores the full metadata snapshot — title, artist, album, cover — so the
 * history stays readable even if the song is later deleted from the library.
 */
export interface PlayHistoryEntry {
  id: string; // unique play id
  songId: string; // library song id (may no longer exist after deletion)
  title: string;
  artist: string;
  album?: string;
  albumCover?: string;
  duration: number; // seconds, song length at time of play
  playedAt: number; // epoch ms when playback started
}

const DB_NAME = "audiovisual_player_db";
const DB_VERSION = 2;

export const DEFAULT_EQ_PRESETS: EqProfile[] = [
  { id: "flat", name: "Flat (Normal)", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], isPreset: true },
  { id: "bass-boost", name: "Bass Boost", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], isPreset: true },
  { id: "vocal-booster", name: "Vocal Booster", gains: [-3, -2, 0, 3, 4, 4, 3, 1, 0, -1], isPreset: true },
  { id: "electronic", name: "Electronic/Dance", gains: [5, 4, 2, 0, -2, 2, 1, 2, 4, 5], isPreset: true },
  { id: "acoustic", name: "Acoustic", gains: [2, 1, 1, 2, 1, 2, 3, 2, 2, 1], isPreset: true },
  { id: "rock", name: "Rock", gains: [4, 3, -1, -2, -1, 1, 3, 4, 4, 3], isPreset: true },
];

class AudioDB {
  private db: IDBDatabase | null = null;

  private initDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("songs")) {
          db.createObjectStore("songs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("eq_profiles")) {
          db.createObjectStore("eq_profiles", { keyPath: "id" });
        }
        // v2: play history ("now playing" log)
        if (!db.objectStoreNames.contains("play_history")) {
          const history = db.createObjectStore("play_history", { keyPath: "id" });
          history.createIndex("playedAt", "playedAt"); // chronological queries
          history.createIndex("songId", "songId");     // per-song play counts
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve(this.db!);
      };

      request.onerror = (event: any) => {
        reject(event.target.error || "Failed to open IndexedDB");
      };
    });
  }

  // --- SONGS ---
  public async getAllSongs(): Promise<Song[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("songs", "readonly");
      const store = transaction.objectStore("songs");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async getSong(id: string): Promise<Song | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("songs", "readonly");
      const store = transaction.objectStore("songs");
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  public async saveSong(song: Song): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("songs", "readwrite");
      const store = transaction.objectStore("songs");
      store.put(song);

      // Resolve only after the transaction has actually committed. Resolving on
      // request.onsuccess can lose data if the app closes before the write flushes.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  public async deleteSong(id: string): Promise<void> {
    const db = await this.initDB();
    // Also remove from playlists
    const playlists = await this.getAllPlaylists();
    for (const pl of playlists) {
      if (pl.songIds.includes(id)) {
        pl.songIds = pl.songIds.filter((sid) => sid !== id);
        await this.savePlaylist(pl);
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("songs", "readwrite");
      const store = transaction.objectStore("songs");
      store.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // --- PLAYLISTS ---
  public async getAllPlaylists(): Promise<Playlist[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("playlists", "readonly");
      const store = transaction.objectStore("playlists");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("playlists", "readwrite");
      const store = transaction.objectStore("playlists");
      store.put(playlist);

      // Wait for commit, not just the request, so playlist edits survive a
      // quick app close/restart.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  public async deletePlaylist(id: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("playlists", "readwrite");
      const store = transaction.objectStore("playlists");
      store.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // --- EQ PROFILES ---
  public async getAllEqProfiles(): Promise<EqProfile[]> {
    const db = await this.initDB();
    const userProfiles: EqProfile[] = await new Promise((resolve, reject) => {
      const transaction = db.transaction("eq_profiles", "readonly");
      const store = transaction.objectStore("eq_profiles");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    return [...DEFAULT_EQ_PRESETS, ...userProfiles];
  }

  public async saveEqProfile(profile: EqProfile): Promise<void> {
    if (profile.isPreset) {
      throw new Error("Cannot overwrite preset profile");
    }
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("eq_profiles", "readwrite");
      const store = transaction.objectStore("eq_profiles");
      store.put(profile);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  public async deleteEqProfile(id: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("eq_profiles", "readwrite");
      const store = transaction.objectStore("eq_profiles");
      store.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // --- PLAY HISTORY (v2) ---
  // Append a "now playing" entry. Also keeps the log bounded: after saving,
  // drop everything but the newest MAX_HISTORY entries.
  public static readonly MAX_HISTORY = 500;

  public async addPlayHistoryEntry(entry: PlayHistoryEntry): Promise<void> {
    const db = await this.initDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("play_history", "readwrite");
      const store = transaction.objectStore("play_history");
      store.put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    await this.trimPlayHistory();
  }

  public async getPlayHistory(limit = 100): Promise<PlayHistoryEntry[]> {
    const db = await this.initDB();
    const all = await new Promise<PlayHistoryEntry[]>((resolve, reject) => {
      const transaction = db.transaction("play_history", "readonly");
      const store = transaction.objectStore("play_history");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    // newest first
    return all.sort((a, b) => b.playedAt - a.playedAt).slice(0, limit);
  }

  public async clearPlayHistory(): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("play_history", "readwrite");
      const store = transaction.objectStore("play_history");
      store.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // Remove oldest entries beyond MAX_HISTORY
  private async trimPlayHistory(): Promise<void> {
    const db = await this.initDB();
    const all = await new Promise<PlayHistoryEntry[]>((resolve, reject) => {
      const transaction = db.transaction("play_history", "readonly");
      const store = transaction.objectStore("play_history");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    if (all.length <= AudioDB.MAX_HISTORY) return;

    const oldestFirst = all.sort((a, b) => a.playedAt - b.playedAt);
    const excess = oldestFirst.slice(0, all.length - AudioDB.MAX_HISTORY);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("play_history", "readwrite");
      const store = transaction.objectStore("play_history");
      for (const e of excess) store.delete(e.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const audioDb = new AudioDB();
export default audioDb;
