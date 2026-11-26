import { useEffect, useRef, useState } from "react";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Slider } from "@astryxdesign/core/Slider";
import { Spinner } from "@astryxdesign/core/Spinner";
import { island } from "./lib/mount.jsx";
import { l10n } from "./lib/l10n.js";
import { clockOf, timeLine } from "./audio-player.jsx";
const glyph = (d) => (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={d} /></svg>;
const Play = glyph("M8 5.75v12.5a.75.75 0 0 0 1.14.64l10.1-6.25a.75.75 0 0 0 0-1.28L9.14 5.11A.75.75 0 0 0 8 5.75z");
const Pause = glyph("M9 5.5v13M15 5.5v13");
const Full = glyph("M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15");
const Download = glyph("M12 4.3v10.8M7.2 10.3l4.8 4.8 4.8-4.8M5 19.4h14");
const SHAPES = new Map();
const known = (seconds) => Number.isFinite(seconds) && seconds > 0;
const quiet = { color: "var(--ink-quiet)" }, lit = { color: "var(--accent-ink)", filter: "var(--glyph-glow)" };
const TALLEST = "min(70vh, 30em)";
export function fullscreen(video, doc = globalThis.document) {
  if (!video) return;
  if (!doc?.fullscreenEnabled && typeof video.webkitEnterFullscreen === "function") {
    video.webkitEnterFullscreen();
    return;
  }
  if (typeof video.requestFullscreen !== "function") return;
  video.controls = true;
  video.requestFullscreen().catch(() => {
    video.controls = false;
  });
}
export function VideoPlayer({ src, poster, name = "", onDownload, onError = () => {
} }) {
  const video = useRef(null);
  const [on, setOn] = useState(false), [at, setAt] = useState(0), [length, setLength] = useState(NaN), [scrub, setScrub] = useState(null);
  const [waiting, setWaiting] = useState(false), [failed, setFailed] = useState(false), [shape, setShape] = useState(SHAPES.get(src) ?? 16 / 9);
  const [saving, setSaving] = useState(null), [note, setNote] = useState("");
  useEffect(() => {
    if (!on) return void 0;
    let frame = requestAnimationFrame(function follow() {
      if (video.current) setAt(video.current.currentTime);
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [on]);
  useEffect(() => {
    const back = () => {
      if (video.current && document.fullscreenElement !== video.current) video.current.controls = false;
    };
    document.addEventListener("fullscreenchange", back);
    return () => document.removeEventListener("fullscreenchange", back);
  }, []);
  if (failed) return null;
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => {
    });
    else element.pause();
  };
  const measure = (event) => setLength(event.currentTarget.duration);
  const sized = (event) => {
    const { videoWidth: w, videoHeight: h } = event.currentTarget;
    if (w > 0 && h > 0) {
      SHAPES.set(src, w / h);
      setShape(w / h);
    }
    measure(event);
  };
  const save = () => {
    if (saving !== null || !onDownload) return;
    setSaving(0);
    setNote("");
    Promise.resolve(onDownload((part) => setSaving(Math.max(0, Math.min(1, part))))).then((line) => line, () => l10n("다운로드하지 못했어요", "Didn't download")).then((line) => {
      setSaving(null);
      setNote(line || "");
    });
  };
  const short = known(length) && length < 10, shown = scrub ?? at, label = `${name} ${on ? l10n("일시정지", "Pause") : l10n("재생", "Play")}`.trim();
  const status = saving !== null ? `${l10n("받는 중…", "Downloading…")}${saving > 0 ? ` ${Math.round(saving * 100)}%` : ""}` : note;
  return <div data-video="" data-on={on ? "" : void 0} style={{ display: "grid", gap: "var(--spacing-1)", width: "100%", maxWidth: `calc(${shape} * ${TALLEST})`, minWidth: 0 }}>
      <AspectRatio ratio={shape}>
        <div onClick={toggle} style={{ position: "relative", width: "100%", height: "100%", background: "#000", borderRadius: "var(--highlight-radius)", overflow: "hidden", cursor: "pointer" }}>
          <video ref={video} src={src} poster={poster || void 0} preload="metadata" playsInline style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} onPlay={(event) => {
    for (const other of document.querySelectorAll("video, audio")) if (other !== event.currentTarget && !other.paused) other.pause();
    setOn(true);
  }} onPause={(event) => {
    setOn(false);
    setWaiting(false);
    setAt(event.currentTarget.currentTime);
  }} onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)} onEnded={(event) => {
    event.currentTarget.currentTime = 0;
    setAt(0);
  }} onTimeUpdate={(event) => {
    if (event.currentTarget.paused) setAt(event.currentTarget.currentTime);
  }} onLoadedMetadata={sized} onDurationChange={measure} onError={() => {
    setFailed(true);
    onError();
  }} />
          {!on || waiting ? <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              {waiting ? <Spinner size="xl" shade="onMedia" /> : <span style={{ display: "grid", placeItems: "center", width: "3.5em", height: "3.5em", borderRadius: "50%", background: "rgba(0, 0, 0, .5)", color: "#fff" }}>
                  <Play width="55%" height="55%" style={{ marginLeft: "8%" }} />
                </span>}
            </div> : null}
        </div>
      </AspectRatio>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", minWidth: 0 }}>
        <IconButton label={label} tooltip={on ? l10n("일시정지", "Pause") : l10n("재생", "Play")} icon={<Icon icon={on ? Pause : Play} />} variant="ghost" style={on ? lit : quiet} onClick={toggle} />
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-3)", fontSize: "var(--font-size-sm)", lineHeight: 1.35 }}>
            <span title={name} style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: on ? "var(--accent-ink)" : "var(--color-text-primary)", textShadow: on ? "var(--hover-glow)" : "none", transition: "color .3s ease, text-shadow .3s ease" }}>{name}</span>
            <span role="status" style={{ flex: "none", color: note && saving === null ? "var(--color-text-error)" : "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {status || timeLine(shown, length)}
            </span>
          </div>
          <Slider label={l10n(`${name} 위치`, `${name} position`).trim()} isLabelHidden valueDisplay="none" width="100%" min={0} max={known(length) ? length : 1} step={0.01} value={Math.min(shown, known(length) ? length : 1)} isDisabled={!known(length)} formatValue={(value) => known(length) ? `${clockOf(value, short)} / ${clockOf(length, short)}` : clockOf(value)} onChange={setScrub} onChangeEnd={(value) => {
    if (video.current) video.current.currentTime = value;
    setAt(value);
    setScrub(null);
  }} />
        </div>
        <IconButton label={l10n(`${name} 전체 화면`, `${name} full screen`).trim()} tooltip={l10n("전체 화면", "Full screen")} icon={<Icon icon={Full} />} variant="ghost" style={quiet} onClick={() => fullscreen(video.current)} />
        {onDownload ? <IconButton label={l10n(`${name} 원본 다운로드`, `Download ${name}`).trim()} tooltip={l10n("원본 다운로드", "Download the original")} icon={<Icon icon={Download} />} variant="ghost" style={saving !== null ? lit : quiet} isLoading={saving !== null} onClick={save} /> : null}
      </div>
    </div>;
}
export const mount = island(VideoPlayer);
