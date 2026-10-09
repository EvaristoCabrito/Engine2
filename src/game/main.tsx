import "@/styles.css";
import { createRoot } from "react-dom/client";
import { GameApp } from "./GameApp";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root for the Ember campaign.");

createRoot(root).render(<GameApp />);
