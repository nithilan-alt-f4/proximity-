import React from "react";
import { Maximize2 } from "lucide-react";

interface SystemDetailsProps {
  activeDrawer: string | null;
  onDrawer: (target: string | null) => void;
  showFullscreen?: boolean;
  onFullscreen?: () => void;
}

export const SystemDetails: React.FC<SystemDetailsProps> = ({
  activeDrawer,
  onDrawer,
  showFullscreen = false,
  onFullscreen,
}) => {
  return (
    <div className="player-utility">
      <div className="player-utility-brand">
        <span className="player-utility-name">PROXIMITY+</span>
        <span className="micro-label">LISTENING DESK</span>
      </div>

      <div className="player-utility-nav">
        <button
          className={`utility-nav-item ${activeDrawer === "queue" ? "utility-nav-item-active" : ""}`}
          onClick={() => onDrawer(activeDrawer === "queue" ? null : "queue")}
        >
          <span>01</span> QUEUE
        </button>
        <button
          className={`utility-nav-item ${activeDrawer === "lyrics" ? "utility-nav-item-active" : ""}`}
          onClick={() => onDrawer(activeDrawer === "lyrics" ? null : "lyrics")}
        >
          <span>02</span> LYRICS
        </button>
      </div>

      <div className="player-utility-footer">
        <span className="micro-label">LOCAL / INDEXED</span>
        {showFullscreen && (
          <button className="utility-fullscreen" onClick={onFullscreen} title="Fullscreen">
            <Maximize2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

export default SystemDetails;
