import React, { useState, useEffect, useRef } from "react";
import { useAudio } from "../context/AudioContext";
import { Search, Music, Layers, RefreshCw, X } from "lucide-react";

type TranslationLang = "original" | "english" | "hindi" | "tamil";

interface LyricsViewerProps {
  onClose?: () => void;
}

export const LyricsViewer: React.FC<LyricsViewerProps> = ({ onClose }) => {
  const { currentSong, currentTime, updateSongLyrics, seek, isPlaying } = useAudio();
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [searchPrompt, setSearchPrompt] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [translationLang, setTranslationLang] = useState<TranslationLang>("original");
  const [translatedSynced, setTranslatedSynced] = useState<{ time: number; text: string }[]>([]);
  const [translating, setTranslating] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0);

  useEffect(() => {
    if (currentSong) {
      setTranslationLang("original");
      setTranslatedSynced([]);
      setLyricsOffset(0);
    }
  }, [currentSong]);

  const handleTranslate = async (lang: string) => {
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
      if (data.translatedSynced && data.translatedSynced.length > 0) {
        setTranslatedSynced(data.translatedSynced);
      }
    } catch (err) { console.error(err); }
    finally { setTranslating(false); }
  };

  const handleLangChange = (lang: TranslationLang) => {
    setTranslationLang(lang);
    if (lang !== "original" && translatedSynced.length === 0) {
      const langMap: Record<string, string> = { english: "English", hindi: "Hindi", tamil: "Tamil" };
      handleTranslate(langMap[lang] || lang);
    }
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (!currentSong) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "lrc" && ext !== "srt" && ext !== "txt") {
      alert("Unsupported file type. Drop .lrc, .srt, or .txt");
      return;
    }
    setLoading(true);
    setLoadingMsg("Processing lyrics file...");
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (!text) { setLoading(false); return; }
        try {
          const res = await fetch("/api/lyrics/sync-dropped", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: currentSong.title, artist: currentSong.artist === "Unknown Artist" ? "" : currentSong.artist, duration: currentSong.duration, fileType: ext, fileContent: text }),
          });
          if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Failed to parse"); }
          const data = await res.json();
          const parsedSynced = (data.syncedLyrics || []).map((l: any) => ({ time: parseFloat(l.time) || 0, text: String(l.text || "") })).sort((a: any, b: any) => a.time - b.time);
          await updateSongLyrics(currentSong.id, data.lyrics, parsedSynced, data.title, data.artist);
        } catch (err: any) { alert(err.message || "Failed to parse file."); }
        finally { setLoading(false); }
      };
      reader.readAsText(file);
    } catch (err) { setLoading(false); }
  };

  const activeLineIndex = currentSong?.syncedLyrics
    ? currentSong.syncedLyrics.findIndex((line, i) => {
        const nextLine = currentSong.syncedLyrics[i + 1];
        const adjustedTime = currentTime - lyricsOffset;
        return adjustedTime >= line.time && (!nextLine || adjustedTime < nextLine.time);
      })
    : -1;

  useEffect(() => {
    if (activeLineIndex === -1) return;
    const activeEl = document.getElementById(`lyric-line-${activeLineIndex}`);
    if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineIndex]);

  const loadingPrompts = ["ANALYZING METADATA...", "QUERYING LYRICS DB...", "GENERATING TIMING MAPS...", "SYNCHRONIZING LRC..."];

  const handleLookupLyrics = async () => {
    if (!currentSong) return;
    setLoading(true);
    let timerIdx = 0;
    setLoadingMsg(loadingPrompts[0]);
    const timer = setInterval(() => { timerIdx = (timerIdx + 1) % loadingPrompts.length; setLoadingMsg(loadingPrompts[timerIdx]); }, 2000);
    try {
      const res = await fetch("/api/lyrics/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: currentSong.title, artist: currentSong.artist === "Unknown Artist" ? "" : currentSong.artist, duration: currentSong.duration, prompt: searchPrompt }),
      });
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Could not find lyrics."); }
      const data = await res.json();
      const parsedSynced = (data.syncedLyrics || []).map((l: any) => ({ time: parseFloat(l.time) || 0, text: String(l.text || "") })).sort((a: any, b: any) => a.time - b.time);
      await updateSongLyrics(currentSong.id, data.lyrics, parsedSynced, data.title, data.artist);
    } catch (err: any) { alert(err.message || "Failed to find lyrics."); }
    finally { clearInterval(timer); setLoading(false); }
  };

  const hasSyncedLyrics = currentSong?.syncedLyrics && currentSong.syncedLyrics.length > 0;
  const originalLyrics = currentSong?.syncedLyrics || [];

  const displayLyrics = translationLang === "original"
    ? originalLyrics.map((l) => ({ time: l.time, text: l.text, translation: "" }))
    : translatedSynced.length > 0
    ? originalLyrics.map((line, i) => ({ time: line.time, text: line.text, translation: translatedSynced[i]?.text || "" }))
    : originalLyrics.map((l) => ({ time: l.time, text: l.text, translation: "" }));

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel animate-slide-in"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDraggingFile(true); }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleFileDrop}
      >
        {isDraggingFile && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.95)", border: "2px dashed var(--line)", margin: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, zIndex: 30, pointerEvents: "none" }}>
            <Layers size={32} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>DROP LYRICS FILE</span>
            <span className="micro-label">SUPPORTS .LRC, .SRT, .TXT</span>
          </div>
        )}

        <div className="drawer-header">
          <div>
            <span className="micro-label">LYRICS MODE</span>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.03em", margin: "2px 0 0" }}>SYNCED LYRICS</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="micro-label" style={{ color: "var(--text-muted)" }}>{currentSong?.title}</span>
            {onClose && <button className="drawer-close" onClick={onClose}><X size={16} /></button>}
          </div>
        </div>

        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div className="translation-bar" style={{ flex: 1 }}>
              {(["original", "english", "hindi", "tamil"] as TranslationLang[]).map((lang) => (
                <button key={lang} className={`translation-btn ${translationLang === lang ? "translation-btn-active" : ""}`} onClick={() => handleLangChange(lang)}>
                  {lang === "original" ? "ORIGINAL" : lang === "english" ? "EN" : lang === "hindi" ? "HI" : "TA"}
                </button>
              ))}
            </div>
            <div className="offset-control">
              <span className="micro-label">OFFSET</span>
              <button className="offset-btn" onClick={() => setLyricsOffset((o) => o - 0.5)}>âˆ’</button>
              <span className="offset-value">{lyricsOffset > 0 ? "+" : ""}{lyricsOffset.toFixed(1)}s</span>
              <button className="offset-btn" onClick={() => setLyricsOffset((o) => o + 0.5)}>+</button>
              {lyricsOffset !== 0 && <button className="offset-reset" onClick={() => setLyricsOffset(0)}>RST</button>}
            </div>
          </div>
          {translating && <span className="micro-label" style={{ color: "var(--red)", marginTop: 6, display: "block" }}>TRANSLATING...</span>}
        </div>

        <div className="drawer-body" style={{ display: "flex", flexDirection: "column" }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40 }}>
              <div style={{ width: 36, height: 36, border: "1px solid var(--line)", borderTop: "2px solid var(--red)", animation: "spin-record 1s linear infinite" }} />
              <span className="micro-label" style={{ animation: "pulse-red 2s ease-in-out infinite" }}>{loadingMsg}</span>
            </div>
          ) : hasSyncedLyrics ? (
            <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {displayLyrics.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                return (
                  <button key={idx} id={`lyric-line-${idx}`} onClick={() => seek(line.time + lyricsOffset + 0.05)}
                    className={`lyrics-line ${isActive ? "lyrics-line-active" : "lyrics-line-dim"}`}
                    style={{ textAlign: "center", width: "100%", background: "none", border: "none" }}>
                    <span>{line.text}</span>
                    {line.translation && <span className="lyrics-translation">{line.translation}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", border: "1px dashed var(--line)", margin: 16 }}>
              <Layers size={32} style={{ color: "var(--line-light)", marginBottom: 8 }} />
              <span className="micro-label">NO SYNCED LYRICS</span>
              <span className="micro-label" style={{ color: "var(--text-muted)", marginTop: 4 }}>FIND LYRICS OR DROP AN .LRC FILE</span>
              <button onClick={handleLookupLyrics} className="load-button" style={{ marginTop: 16 }}>
                <RefreshCw size={14} style={{ color: "var(--red)" }} />
                <span>FIND LYRICS</span>
              </button>
            </div>
          )}
        </div>

        {!loading && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--line)" }}>
              <Search size={14} style={{ color: "var(--text-muted)" }} />
              <input type="text" placeholder="Search / translation hint..." value={searchPrompt} onChange={(e) => setSearchPrompt(e.target.value)}
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "var(--ink)" }} />
            </div>
            <button onClick={handleLookupLyrics} className="save-button">
              <RefreshCw size={12} /> SYNC
            </button>
          </div>
        )}
      </div>
    </>
  );
};
export default LyricsViewer;
