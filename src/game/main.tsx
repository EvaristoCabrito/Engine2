import "@/styles.css";
import { createRoot } from "react-dom/client";
import { GameApp } from "./GameApp";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for the Ember campaign.");

// The title launches /game.html?start=... once. A reload of that page goes back to the title
// instead of replaying the launch (new campaign intro); the title clears this mark on launch.
// A map-editor session still resumes on reload, as in Ember (its own resume snapshot).
const LAUNCHED = "engine2:game-launched";
let reload = false;
try {
  reload = !!sessionStorage.getItem(LAUNCHED) && !sessionStorage.getItem("ember:editor-resume");
  sessionStorage.setItem(LAUNCHED, "1");
} catch { /* storage blocked: just start */ }

if (reload) window.location.replace("/");
else createRoot(root).render(<GameApp />);
