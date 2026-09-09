import { useState, useEffect } from "react";

const THEME_STORAGE_KEY = "proximity-theme";

/**
 * Single source of truth for the current theme.
 *
 * Reads the initial state from the `data-theme` attribute on <html>, which is
 * set by the inline init script in index.html (before first paint). A
 * MutationObserver keeps `isDark` in sync whenever the attribute changes, so
 * multiple mounted controls (e.g. the headbar toggle and the fullscreen
 * player toggle) stay consistent even though state is only read here.
 *
 * Call this hook ONCE in the highest common owner of all theme controls and
 * pass `isDark` / `onToggleTheme` down as props.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === "dark"
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.dataset.theme === "dark");
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  return { isDark, toggleTheme };
}
