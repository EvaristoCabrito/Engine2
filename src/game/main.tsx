import "@/styles.css";
import { createRoot } from "react-dom/client";
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
else createRoot(root).render(<GameApp />);
