import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Streams the map image once so the loading bar reports bytes actually received. */
export function useMapLoading(source: string) {
  const [progress, setProgress] = useState<number | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const finished = useRef(false);
  const objectUrl = useRef<string | null>(null);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setProgress(100);
        window.setTimeout(() => setVisible(false), 280);
      });
    });
  }, []);

  const fail = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setFailed(true);
    setVisible(false);
  }, []);

  useEffect(() => {
    const request = new XMLHttpRequest();
    let measurable = false;
    request.open("GET", source);
    request.responseType = "blob";
    request.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        setProgress(null);
        return;
      }
      measurable = true;
      // Reserve the final point until the browser has decoded the image and the map has
      // positioned its markers. The number before then is the exact transfer byte ratio.
      setProgress(Math.min(99, Math.floor((event.loaded / event.total) * 99)));
    };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300 || !(request.response instanceof Blob)) {
        fail();
        return;
      }
      if (measurable) setProgress(99);
      objectUrl.current = URL.createObjectURL(request.response);
      setImageSrc(objectUrl.current);
    };
    request.onerror = fail;
    request.onabort = fail;
    request.send();
    return () => {
      request.onprogress = null;
      request.onload = null;
      request.onerror = null;
      request.onabort = null;
      request.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [source, fail]);

  return { progress, visible, finish, fail, imageSrc, failed };
}

/** THE loading screen — there is exactly one. game.html builds it (#boot-loading: the art
 * LoadingSCreen.jpg, 2128x912, from the permanent cache the title screen fills, scaled to cover
 * the screen, its bar inside the art's own bar frame and the caption in the plaque under it) and
 * shows it while the game's code loads. Everything else that loads (map, battle) drives that same
 * element instead of drawing a copy of its own, so the screen can never stack or overlap itself:
 * it stays up while anything is loading and shows the most recent request's bar and caption. */
type LoadingRequest = { progress: number | null; label: string; barLabel: string; order: number };
const requests = new Map<string, LoadingRequest>();
let requestOrder = 0;
let hideTimer = 0;

function loadingElement(): HTMLElement {
  const found = document.getElementById("boot-loading");
  if (found) return found;
  // not on this page (or already gone): build the same screen
  const el = document.createElement("div");
  el.id = "boot-loading";
  el.setAttribute("aria-live", "polite");
  el.style.cssText = "position:fixed;inset:0;z-index:100;overflow:hidden;background:#151311;transition:opacity .25s ease";
  el.innerHTML = [
    '<div class="art" style="position:absolute;left:50%;top:50%;width:max(100vw,calc(100vh*2128/912));aspect-ratio:2128/912;transform:translate(-50%,-50%);background:var(--boot-art) center/100% 100% no-repeat;visibility:hidden">',
    '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" style="position:absolute;left:35.34%;top:86.29%;width:28.67%;height:2.63%;border-radius:2px;overflow:hidden"><div id="boot-fill" style="width:0;height:100%;background:linear-gradient(90deg,#713718,#e1a541,#fff0a2);transition:width .1s linear"></div></div>',
    '<p id="boot-status" style="position:absolute;left:42.43%;top:92.32%;width:14.1%;height:4.28%;margin:0;display:grid;place-items:center;text-align:center;text-transform:uppercase;color:#eee0c8;filter:drop-shadow(0 1px 2px #000);font:500 calc(max(100vh,100vw*912/2128)*.0125)/1.15 Figtree,sans-serif;letter-spacing:.08em"></p>',
    '</div>',
  ].join("");
  document.body.appendChild(el);
  const w = window as Window & { __loadingArtUrl?: string; __loadingArt?: Promise<string> };
  const reveal = (src: string) => {
    el.style.setProperty("--boot-art", `url("${src}")`);
    (el.querySelector(".art") as HTMLElement).style.visibility = "visible";
  };
  if (w.__loadingArtUrl) reveal(w.__loadingArtUrl);
  else void (w.__loadingArt ?? Promise.resolve("/game/ui/LoadingSCreen.jpg?v=2")).then(reveal);
  return el;
}

/** Show the newest request on the one screen, or fade it out when nothing is loading. */
function renderLoading(): void {
  if (typeof document === "undefined") return;
  const el = loadingElement();
  let top: LoadingRequest | null = null;
  for (const r of requests.values()) if (!top || r.order > top.order) top = r;
  window.clearTimeout(hideTimer);
  if (!top) {
    el.classList.add("is-leaving");
    el.style.opacity = "0";
    hideTimer = window.setTimeout(() => { if (!requests.size) el.style.display = "none"; }, 260);
    return;
  }
  el.classList.remove("is-leaving");
  el.style.display = "";
  el.style.opacity = "1";
  el.setAttribute("aria-label", top.label);
  const fill = el.querySelector<HTMLElement>("#boot-fill");
  const status = el.querySelector<HTMLElement>("#boot-status");
  const bar = el.querySelector<HTMLElement>("[role=progressbar]");
  // LOCKED (2026-10-06): no real number means no fill — never a fake sweeping bar.
  if (fill) fill.style.width = top.progress === null ? "0" : `${top.progress}%`;
  if (status) status.textContent = top.label;
  if (bar) {
    bar.setAttribute("aria-label", top.barLabel);
    if (top.progress === null) bar.removeAttribute("aria-valuenow");
    else bar.setAttribute("aria-valuenow", String(Math.round(top.progress)));
  }
}

/** game.html's own load (its code) is an open request from the first paint until the app has
 * painted (main.tsx then calls releaseLoading("page")). Its inline script reports real progress. */
if (typeof document !== "undefined" && document.getElementById("boot-loading")) {
  requests.set("page", { progress: 0, label: "Preparando a tela…", barLabel: "Preparando a tela", order: requestOrder++ });
  const w = window as Window & { __bootProgress?: (pct: number) => void };
  w.__bootProgress = (pct: number) => {
    const page = requests.get("page");
    if (!page) return;
    page.progress = Math.max(page.progress ?? 0, pct);
    page.label = `Preparando a tela · ${Math.round(page.progress)}%`;
    renderLoading();
  };
}

export function setLoading(id: string, progress: number | null, label: string, barLabel: string): void {
  const r = requests.get(id);
  if (r) { r.progress = progress; r.label = label; r.barLabel = barLabel; }
  else requests.set(id, { progress, label, barLabel, order: requestOrder++ });
  renderLoading();
}

export function releaseLoading(id: string): void {
  if (!requests.delete(id)) return;
  renderLoading();
}

/** A component's request on the one loading screen while `visible`. */
function useLoadingScreen(visible: boolean, progress: number | null, label: string, barLabel: string): void {
  const id = useRef(`loading-${Math.random().toString(36).slice(2)}`).current;
  useLayoutEffect(() => {
    if (visible) setLoading(id, progress, label, barLabel);
    else releaseLoading(id);
  }, [id, visible, progress, label, barLabel]);
  useLayoutEffect(() => () => releaseLoading(id), [id]);
}

export function MapLoadingOverlay({ progress, visible }: { progress: number | null; visible: boolean }) {
  const label = progress === null ? "Carregando o mapa…" : `Carregando o mapa · ${progress}%`;
  useLoadingScreen(visible, progress, label, "Carregando o mapa");
  return null;
}

/** Screen ids heavy enough (a big map background, the battle canvas' whole art set) that
 * the swap into them can outrun a single React commit and leave a blank/frozen frame in
 * between — the general "stuck for a few seconds" complaint. Anything else (briefing,
 * cutscenes, menus) is cheap enough not to need this. The two map screens are NOT listed:
 * each one mounts its own MapLoadingOverlay (same art) in its very first commit with the
 * real byte progress of the map, and this number-less curtain on top of it hid that real bar
 * (empty bar for 380 ms while the map underneath was already at 99-100%). */
const HEAVY_SCREENS = new Set(["battle"]);

/** Curtains any transition into a HEAVY_SCREENS destination behind the same loading art
 * used for the map, for a floor of MIN_VISIBLE_MS so it always reads as a deliberate
 * loading beat rather than a flicker, however fast the actual mount turns out to be. */
export function useLoadingCurtain(screen: string): boolean {
  const [visible, setVisible] = useState(false);
  const prevScreen = useRef(screen);

  // A layout effect runs before the browser paints, so the curtain appears in the very same
  // frame as the new screen — the map/board is never shown, even for one frame, before it.
  useLayoutEffect(() => {
    if (prevScreen.current === screen) return;
    prevScreen.current = screen;
    if (!HEAVY_SCREENS.has(screen)) return;
    setVisible(true);
    const MIN_VISIBLE_MS = 380;
    const timer = window.setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [screen]);

  return visible;
}

export function LoadingCurtain({ visible, progress = null, status = "Preparando a tela…" }: { visible: boolean; progress?: number | null; status?: string }) {
  const label = progress === null ? status : `${status} · ${progress}%`;
  useLoadingScreen(visible, progress, label, status);
  return null;
}
