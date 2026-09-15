import React, { useRef, useCallback, useEffect } from "react";

/**
 * TiltCard — cursor-tracking 3D tilt on the industrial card language.
 * Pure transform/opacity (GPU-safe), pointer-only (no touch tilt), and
 * fully disabled under prefers-reduced-motion.
 */
interface TiltCardProps {
  className?: string;
  children: React.ReactNode;
  /** Max rotation in degrees. Default 6. */
  maxTilt?: number;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export const TiltCard: React.FC<TiltCardProps> = ({ className = "", children, maxTilt = 6, onClick, title }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const restingRef = useRef(true);
  const rmRef = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Clean up any pending rAF on unmount
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);

  const applyTilt = useCallback((rx: number, ry: number) => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }, []);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || restingRef.current || rmRef.current) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * 2 * maxTilt;
    const rx = -(py - 0.5) * 2 * maxTilt;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => applyTilt(rx, ry));
  }, [maxTilt, applyTilt]);

  const onEnter = useCallback(() => {
    const el = wrapRef.current;
    if (!el || rmRef.current) return;
    restingRef.current = false;
    el.classList.add("tilt-active");
  }, []);

  const onLeave = useCallback(() => {
    const el = wrapRef.current;
    restingRef.current = true;
    if (el) {
      el.classList.remove("tilt-active");
      el.style.transform = ""; // clear inline so CSS transition eases back flat
    }
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`tilt-card ${className}`}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={onClick}
      title={title}
    >
      {children}
    </div>
  );
};

export default TiltCard;
