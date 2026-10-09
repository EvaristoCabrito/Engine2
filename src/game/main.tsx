import "@/styles.css";
import { createRoot } from "react-dom/client";
import { releaseLoading } from "./MapLoadingOverlay";
import { GameApp } from "./GameApp";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for the Ember campaign.");

// The title launches /game.html?start=... ; a browser reload of that page goes back to the title
// instead of replaying the launch (new campaign intro). A map-editor session still resumes on
// reload, as in Ember (its own resume snapshot).
const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
let editorResume = false;
try { editorResume = !!sessionStorage.getItem("ember:editor-resume"); } catch { /* storage blocked */ }

if (nav?.type === "reload" && !editorResume) window.location.replace("/");
else {
  createRoot(root).render(<GameApp />);
  // The loading screen (game.html's, the only one) covers the code load; once the app has
  // painted, the page's own request ends. If a map or battle is loading by then, the same screen
  // simply stays up with their bar (MapLoadingOverlay.tsx) — never a second screen on top.
  if (document.getElementById("boot-loading")) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Remember how many files this load needed, so the next one's bar measures against it.
      try { localStorage.setItem("ember.bootFileTotal", String(performance.getEntriesByType("resource").length)); } catch { /* storage blocked */ }
      (window as Window & { __bootProgress?: (pct: number) => void }).__bootProgress?.(100);
      releaseLoading("page");
    }));
  }
}
