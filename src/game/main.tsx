import "@/styles.css";
import { createRoot } from "react-dom/client";
import { GameApp } from "./GameApp";
import { returnToTitle, shouldReturnToTitle } from "./titleNavigation";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for the Ember campaign.");

// The title launches /game.html?start=... ; a browser reload of that page goes back to the title
// instead of replaying the launch (new campaign intro). A map-editor session still resumes on
// reload, as in Ember (its own resume snapshot).
const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
let editorResume = false;
try { editorResume = !!sessionStorage.getItem("ember:editor-resume"); } catch { /* storage blocked */ }

if (shouldReturnToTitle(new URLSearchParams(location.search).get("start"), nav?.type === "reload", editorResume)) returnToTitle();
else {
  createRoot(root).render(<GameApp />);
  // game.html's boot loading screen covers the code load; fade it once the app has painted.
  const boot = document.getElementById("boot-loading");
  if (boot) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Remember how many files this boot needed, so the next boot's bar measures against it.
      try { localStorage.setItem("ember.bootFileTotal", String(performance.getEntriesByType("resource").length)); } catch { /* storage blocked */ }
      (window as Window & { __finishBoot?: () => void }).__finishBoot?.();
    }));
  }
}
