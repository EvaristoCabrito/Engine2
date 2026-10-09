import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Monitor, Volume2, Languages, Check } from "lucide-react";
import { GraphicsQualityControl } from "./GraphicsQualityControl";
import { getDevGfx, setDevGfx, subscribeDevGfx } from "./gfx/three/devGfx";
import { getGraphicsQuality, subscribeGraphicsQuality } from "./graphicsQuality";
import { getAudioVolumes, setMusicVolume, setSfxVolume, setCutsceneVolume } from "./audio";
import { uiText as t, useGamePreferences, setGamePreferences } from "./gamePreferences";

export function OptionsButton({ muted, onMute }: { muted: boolean; onMute: () => void }) {
 const prefs = useGamePreferences();
 const gfx = useSyncExternalStore(subscribeDevGfx, getDevGfx, getDevGfx);
 const quality = useSyncExternalStore(subscribeGraphicsQuality, getGraphicsQuality, () => "high" as const);
 const [open, setOpen] = useState(false);
 const [volumes, setVolumes] = useState(getAudioVolumes);
 const [error, setError] = useState("");
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
 return <>
 <button type="button" className="w-full ember-btn ember-btn-ghost py-3" onClick={() => { setVolumes(getAudioVolumes()); setOpen(true); }}>{t("Opções")}</button>
 <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} className="game-options ember-panel m-auto w-[min(94vw,52rem)] max-h-[90dvh] overflow-y-auto p-5 sm:p-7" aria-labelledby="game-options-title">
 <div className="game-options-header flex items-center justify-between gap-4 mb-6 pb-5"><h2 id="game-options-title" className="ember-title text-4xl">{t("Opções")}</h2><button type="button" autoFocus className="ember-btn ember-btn-ghost ember-btn-sm px-4 py-2" onClick={() => setOpen(false)}>{t("Fechar")}</button></div>
 <div className="grid gap-4 sm:grid-cols-2 items-start">
 <section className="game-options-section ember-slot space-y-3 p-4"><h3 className="game-options-heading ember-title"><Monitor aria-hidden="true" />{t("Gráficos")}</h3><GraphicsQualityControl /><p className="text-xs text-muted">{t("Ajustes manuais personalizam o preset selecionado.")}</p>
 {quality !== 'low' && <label className="flex justify-between gap-3 text-sm"><span>{t("Sombras")}</span><input type="checkbox" checked={gfx.realShadows} onChange={e => setDevGfx({ realShadows: e.target.checked })} /></label>}
 {quality === 'medium' && <label className="flex justify-between gap-3 text-sm"><span>{t("Sombras mais leves")}</span><input type="checkbox" checked={gfx.softShadows} onChange={e => setDevGfx({ softShadows: e.target.checked })} /></label>}
 {([['localLights', 'Luzes locais'], ['atmosphericFx', 'FX atmosféricos']] as const).map(([key,label]) => <label key={key} className="flex justify-between gap-3 text-sm"><span>{t(label)}</span><input type="checkbox" checked={gfx[key]} onChange={e => setDevGfx({ [key]: e.target.checked })} /></label>)}
 {quality === 'high' && <label className="flex justify-between gap-3 text-sm"><span>{t("Sombras de contato")}</span><input type="checkbox" checked={gfx.contactShadows} disabled={!gfx.realShadows} onChange={e => setDevGfx({ contactShadows: e.target.checked })} /></label>}
 <button type="button" className="ember-btn px-3 py-2" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setError(""); } catch { setError(t("Tela cheia indisponível neste navegador.")); } }}>{t("Tela cheia")}</button>{error && <p role="status">{error}</p>}
 </section>
 <section className="game-options-section ember-slot space-y-4 p-4"><h3 className="game-options-heading ember-title"><Volume2 aria-hidden="true" />{t("Áudio")}</h3><label className="flex justify-between text-sm">{t("Silenciar")}<input type="checkbox" checked={muted} onChange={onMute} /></label>
 {([['music','Música',setMusicVolume],['sfx','Efeitos sonoros',setSfxVolume],['cutscene','Vídeos',setCutsceneVolume]] as const).map(([key,label,setter]) => <label key={key} className="block text-sm">{t(label)} <span className="float-right">{Math.round(volumes[key]*100)}%</span><input className="w-full" type="range" min="0" max="1" step="0.01" value={volumes[key]} onChange={e => { const value=Number(e.target.value); setter(value); setVolumes(v => ({...v,[key]:value})); }} /></label>)}
 </section>
 <section className="game-options-section ember-slot space-y-3 p-4"><h3 className="game-options-heading ember-title"><Languages aria-hidden="true" />{t("Idiomas")}</h3>
 {([['uiLanguage','Interface e nomes'],['dialogueLanguage','Diálogos']] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-2 text-sm">{t(label)}<select className="bg-bg border border-border rounded p-2" value={prefs[key]} onChange={e => setGamePreferences({[key]:e.target.value as 'pt'|'en'})}><option value="pt">Português</option><option value="en">English</option></select></label>)}
 <label className="flex items-center justify-between gap-2 text-sm">{t("Idioma das legendas")}<select className="bg-bg border border-border rounded p-2" value={prefs.subtitleLanguage} onChange={e => setGamePreferences({subtitleLanguage:e.target.value as 'pt'|'en'})}><option value="pt">{t("Português (Brasil)")}</option><option value="en">English</option></select></label></section>
 <section className="game-options-section ember-slot space-y-3 p-4"><h3 className="game-options-heading ember-title">{t("Acessibilidade")}</h3><label className="flex justify-between text-sm">{t("Exibir legendas")}<input type="checkbox" checked={prefs.subtitles} onChange={e => setGamePreferences({subtitles:e.target.checked})} /></label>
 <label className="flex justify-between gap-2 text-sm">{t("Tamanho do diálogo")}<select className="bg-bg border border-border rounded p-2" value={prefs.dialogueScale} onChange={e => setGamePreferences({dialogueScale:Number(e.target.value)})}>{([[1,'Normal'],[1.15,'Grande'],[1.3,'Muito grande']] as const).map(([value,label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></section>
 </div><p className="game-options-footer ember-rule mt-6 pt-4 text-xs text-muted flex items-center justify-center gap-2"><Check className="size-3.5" aria-hidden="true" />{t("Alterações salvas automaticamente.")}</p>
 </dialog></>;
}
