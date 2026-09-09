import React, { useState, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import { EqProfile, DEFAULT_EQ_PRESETS } from "../lib/db";
import { X, Save, Trash2, RefreshCw } from "lucide-react";

interface EqualizerProps {
  onClose?: () => void;
}

export const Equalizer: React.FC<EqualizerProps> = ({ onClose }) => {
  const { eqProfiles, activeEqProfile, applyEqProfile, saveCustomEqProfile, deleteEqProfile } = useAudio();
  const [sliderGains, setSliderGains] = useState<number[]>([...activeEqProfile.gains]);
  const [profileName, setProfileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const frequencies = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];

  useEffect(() => { setSliderGains([...activeEqProfile.gains]); }, [activeEqProfile]);

  const handleSliderChange = (index: number, value: number) => {
    const newGains = [...sliderGains];
    newGains[index] = value;
    setSliderGains(newGains);
    applyEqProfile({ id: "temp_custom", name: "Custom", gains: newGains, isPreset: false });
  };

  const resetToFlat = () => applyEqProfile(DEFAULT_EQ_PRESETS[0]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!profileName.trim()) { setErrorMsg("Enter a name"); return; }
    try {
      const saved = await saveCustomEqProfile(profileName.trim(), [...sliderGains]);
      applyEqProfile(saved);
      setProfileName("");
      setIsSaving(false);
    } catch (err: any) { setErrorMsg(err.message || "Failed to save"); }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel animate-slide-in">
        <div className="drawer-header">
          <div>
            <span className="micro-label">FREQUENCY RESPONSE</span>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.03em", margin: "2px 0 0" }}>10-BAND EQ</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={resetToFlat} className="eq-profile-btn" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <RefreshCw size={12} /> FLAT
            </button>
            <button onClick={() => setIsSaving(!isSaving)} className="save-button">
              + SAVE
            </button>
            {onClose && <button className="drawer-close" onClick={onClose}><X size={16} /></button>}
          </div>
        </div>

        <div className="drawer-body" style={{ padding: 20 }}>
          {isSaving && (
            <form onSubmit={handleSaveProfile} style={{ marginBottom: 16, padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="micro-label">PROFILE NAME</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" placeholder="My Bass Boost" value={profileName} onChange={(e) => setProfileName(e.target.value)}
                  style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--line)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", background: "transparent" }} />
                <button type="submit" className="save-button"><Save size={12} /> SAVE</button>
              </div>
              {errorMsg && <span className="micro-label" style={{ color: "var(--red)" }}>{errorMsg}</span>}
            </form>
          )}

          <div className="eq-profiles" style={{ marginBottom: 16 }}>
            {eqProfiles.map((profile) => {
              const isActive = activeEqProfile.id === profile.id;
              return (
                <div key={profile.id} className={`eq-profile-btn ${isActive ? "eq-profile-btn-active" : ""}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => applyEqProfile(profile)} style={{ cursor: "pointer" }}>{profile.name}</button>
                  {!profile.isPreset && (
                    <button onClick={() => deleteEqProfile(profile.id)} style={{ color: "var(--text-muted)", cursor: "pointer" }}>
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 4, justifyContent: "center", padding: 16, border: "1px solid var(--line)", background: "var(--paper-2)" }}>
            {frequencies.map((freq, i) => (
              <div key={freq} className="eq-slider-group">
                <span className="eq-gain">{sliderGains[i] > 0 ? `+${sliderGains[i]}` : sliderGains[i] ?? 0}</span>
                <input type="range" min="-12" max="12" step="0.5" value={sliderGains[i] ?? 0} onChange={(e) => handleSliderChange(i, parseFloat(e.target.value))} />
                <span className="eq-freq">{freq}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
export default Equalizer;
