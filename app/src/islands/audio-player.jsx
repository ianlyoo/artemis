import { useEffect, useRef, useState } from "react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Slider } from "@astryxdesign/core/Slider";
import { island } from "./lib/mount.jsx";
import { l10n } from "./lib/l10n.js";
const Play = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 5.75v12.5a.75.75 0 0 0 1.14.64l10.1-6.25a.75.75 0 0 0 0-1.28L9.14 5.11A.75.75 0 0 0 8 5.75z" />
  </svg>;
const Pause = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 5.5v13M15 5.5v13" />
  </svg>;
const known = (seconds) => Number.isFinite(seconds) && seconds > 0;
export function clockOf(seconds, short = false) {
  const s = Math.max(0, Number(seconds) || 0);
  if (short) return s.toFixed(1);
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
export function timeLine(at, length) {
  if (!known(length)) return at > 0 ? clockOf(at) : "";
  const short = length < 10, unit = short ? "s" : "";
  return at > 0 ? `${clockOf(at, short)} / ${clockOf(length, short)}${unit}` : `${clockOf(length, short)}${unit}`;
}
let playing = null;
const quiet = { color: "var(--ink-quiet)" }, lit = { color: "var(--accent-ink)", filter: "var(--glyph-glow)" };
export function AudioPlayer({ src, name = "", compact = false, onError = () => {
} }) {
  const audio = useRef(null);
  const [on, setOn] = useState(false), [at, setAt] = useState(0), [length, setLength] = useState(NaN), [scrub, setScrub] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!on) return void 0;
    let frame = requestAnimationFrame(function follow() {
      if (audio.current) setAt(audio.current.currentTime);
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [on]);
  useEffect(() => () => {
    if (playing === audio.current) playing = null;
  }, []);
  if (failed) return null;
  const toggle = () => {
    const element2 = audio.current;
    if (!element2) return;
    if (element2.paused) element2.play().catch(() => {
    });
    else element2.pause();
  };
  const measure = (event) => setLength(event.currentTarget.duration);
  const element = <audio ref={audio} src={src} preload="metadata" onPlay={(event) => {
    if (playing && playing !== event.currentTarget) playing.pause();
    playing = event.currentTarget;
    setOn(true);
  }} onPause={(event) => {
    if (playing === event.currentTarget) playing = null;
    setOn(false);
    setAt(event.currentTarget.currentTime);
  }} onEnded={(event) => {
    event.currentTarget.currentTime = 0;
    setAt(0);
  }} onTimeUpdate={(event) => {
    if (event.currentTarget.paused) setAt(event.currentTarget.currentTime);
  }} onLoadedMetadata={measure} onDurationChange={measure} onError={() => {
    setFailed(true);
    onError();
  }} />;
  const icon = <Icon icon={on ? Pause : Play} />, label = `${name} ${on ? l10n("일시정지", "Pause") : l10n("재생", "Play")}`.trim();
  if (compact) return <>{element}<IconButton label={label} tooltip={name || void 0} icon={icon} variant="ghost" style={on ? lit : quiet} onClick={toggle} /></>;
  const short = known(length) && length < 10, shown = scrub ?? at;
  return <div data-sound="" data-on={on ? "" : void 0} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", minWidth: 0 }}>
      {element}
      <IconButton label={label} tooltip={on ? l10n("일시정지", "Pause") : l10n("재생", "Play")} icon={icon} variant="ghost" style={on ? lit : quiet} onClick={toggle} />
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-3)", fontSize: "var(--font-size-sm)", lineHeight: 1.35 }}>
          <span title={name} style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: on ? "var(--accent-ink)" : "var(--color-text-primary)", textShadow: on ? "var(--hover-glow)" : "none", transition: "color .3s ease, text-shadow .3s ease" }}>{name}</span>
          <span style={{ flex: "none", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{timeLine(shown, length)}</span>
        </div>
        <Slider label={l10n(`${name} 위치`, `${name} position`).trim()} isLabelHidden valueDisplay="none" width="100%" min={0} max={known(length) ? length : 1} step={0.01} value={Math.min(shown, known(length) ? length : 1)} isDisabled={!known(length)} formatValue={(value) => known(length) ? `${clockOf(value, short)} / ${clockOf(length, short)}` : clockOf(value)} onChange={setScrub} onChangeEnd={(value) => {
    if (audio.current) audio.current.currentTime = value;
    setAt(value);
    setScrub(null);
  }} />
      </div>
    </div>;
}
export const mount = island(AudioPlayer);
