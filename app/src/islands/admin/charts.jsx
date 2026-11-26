import { useId } from "react";
export const STROKE = 10, GAP = 3;
export const TRACK = "color-mix(in srgb,var(--ink) 9%,transparent)";
const ring = (i) => 50 - STROKE / 2 - i * (STROKE + GAP);
const arc = { fill: "none", strokeWidth: STROKE, transform: "rotate(-90 50 50)" };
const middle = { position: "absolute", inset: 0, display: "grid", placeContent: "center", justifyItems: "center", textAlign: "center", pointerEvents: "none" };
export function Rings({ rings, size, label, children, title }) {
  return <div role="img" aria-label={label} title={title} style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ display: "block" }}>
        {rings.map((r, i) => {
    const c = 2 * Math.PI * ring(i), v = Math.max(0, Math.min(100, Number(r.value) || 0));
    return <g key={i}>
              <circle cx="50" cy="50" r={ring(i)} {...arc} stroke={TRACK} />
              {v ? <circle cx="50" cy="50" r={ring(i)} {...arc} stroke={r.color} strokeDasharray={`${c * v / 100} ${c}`} style={{ transition: "stroke-dasharray var(--dur-grow) var(--ease-out)" }} /> : null}
            </g>;
  })}
      </svg>
      <div style={middle}>{children}</div>
    </div>;
}
export function Donut({ slices, size, label, lit, picked, onPick, onLit, children }) {
  const id = useId(), total = slices.reduce((n, s) => n + s.n, 0), c = 2 * Math.PI * ring(0), gap = slices.length > 1 ? GAP : 0;
  let at = 0;
  const one = lit ?? picked;
  return <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-labelledby={id} focusable="false" style={{ display: "block", overflow: "visible" }}>
        <title id={id}>{label}</title>
        <circle cx="50" cy="50" r={ring(0)} {...arc} stroke={TRACK} />
        {total ? slices.map((s) => {
    const len = c * s.n / total, start = at;
    at += len;
    return <circle key={s.key} cx="50" cy="50" r={ring(0)} {...arc} stroke={s.color} strokeDasharray={`${Math.max(len - gap, 0.01)} ${c}`} strokeDashoffset={-(start + gap / 2)} onClick={() => onPick?.(s.key)} onPointerEnter={() => onLit?.(s.key)} onPointerLeave={() => onLit?.(null)} style={{ cursor: "pointer", opacity: one && one !== s.key ? 0.25 : 1, transition: "opacity var(--dur-hover) var(--ease-hover)" }} />;
  }) : null}
      </svg>
      <div style={middle}>{children}</div>
    </div>;
}
