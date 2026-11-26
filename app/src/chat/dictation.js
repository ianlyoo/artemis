import { el, svg } from "../boards/dom.js";
import { PLAIN, TYPES } from "../dictation/take.js";
const MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21";
export const TRANSCRIBE = "/dictation/transcribe";
const HOLD_MS = 400;
const PAUSE_MS = 1500, SPOKEN_MS = 300, TICK_MS = 100;
const LOUD = 0.01;
const MALLET_GAIN = 1;
export const bound = (clipMs) => 3e3 + clipMs / 10;
export const CEILING_MS = 75e3;
const AUDIO = new URL("./audio/", import.meta.url);
let context = null, mallets;
function audio() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Context ? context ??= new Context() : null;
}
async function loadMallet(ear, name, cues) {
  try {
    const response = await fetch(new URL(`e-mallet-${name}.wav`, cues));
    return response.ok ? await ear.decodeAudioData(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
function prepareMallets(cues) {
  try {
    if (mallets) return mallets;
    const ear = audio();
    if (!ear) return null;
    const gain = ear.createGain();
    gain.gain.value = MALLET_GAIN;
    gain.connect(ear.destination);
    return mallets = { ear, gain, buffers: { start: loadMallet(ear, "start", cues), stop: loadMallet(ear, "stop", cues) } };
  } catch {
    return null;
  }
}
function hearPause(stream, paused) {
  const ear = audio();
  if (!ear) return () => {
  };
  if (ear.state === "suspended") void ear.resume().catch(() => {
  });
  const source = ear.createMediaStreamSource(stream), meter = ear.createAnalyser(), wave = new Float32Array(meter.fftSize);
  source.connect(meter);
  let spoken = 0, quiet = 0;
  const timer = setInterval(() => {
    meter.getFloatTimeDomainData(wave);
    let sum = 0;
    for (const v of wave) sum += v * v;
    if (sum / wave.length > LOUD * LOUD) {
      spoken += TICK_MS;
      quiet = 0;
    } else if (spoken >= SPOKEN_MS && (quiet += TICK_MS) >= PAUSE_MS) paused();
  }, TICK_MS);
  return () => {
    clearInterval(timer);
    source.disconnect();
  };
}
async function record(media, Recorder, paused) {
  const stream = await media.getUserMedia({ audio: PLAIN });
  let deaf = () => {
  };
  const release = () => {
    deaf();
    for (const track of stream.getTracks()) track.stop();
  };
  try {
    const type = TYPES.find((t) => Recorder.isTypeSupported?.(t)) ?? "";
    const recorder = new Recorder(stream, type ? { mimeType: type } : void 0);
    const chunks = [], t0 = performance.now();
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    const stopped = new Promise((done) => recorder.addEventListener("stop", done, { once: true }));
    recorder.start();
    if (paused) deaf = hearPause(stream, paused);
    const end = () => {
      if (recorder.state !== "inactive") recorder.stop();
      release();
    };
    return { async stop() {
      const ms = performance.now() - t0;
      end();
      await stopped;
      return { blob: new Blob(chunks, { type: recorder.mimeType || type }), ms };
    }, cancel: end };
  } catch (error) {
    release();
    throw error;
  }
}
async function transcribe(blob, wait) {
  const quit = new AbortController(), timer = setTimeout(() => quit.abort(), wait);
  try {
    const response = await fetch(TRANSCRIBE, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob, signal: quit.signal });
    const body = response.ok ? await response.json() : null;
    return typeof body?.text === "string" ? body.text.trim() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}
export function createDictation({ field, label, title, onText, onState, learning = false, button = null, cues = AUDIO }) {
  const Speech = learning ? null : globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  const media = globalThis.navigator?.mediaDevices, Recorder = globalThis.MediaRecorder;
  const records = typeof media?.getUserMedia === "function" && typeof Recorder === "function";
  if (!Speech && !records) return null;
  const phone = !!globalThis.matchMedia?.("(pointer: coarse)").matches;
  const sounds = phone ? null : prepareMallets(cues);
  let cue = 0;
  let take = null, shown = "stopped", press = null, gone = false, rest = "stopped";
  const waiting = new Set(), heard = new AbortController();
  const node = button ?? el("button", { type: "button", class: "composer-icon composer-mic", "aria-label": label, "aria-pressed": "false", title }, svg("svg", { viewBox: "0 0 24 24", class: "composer-glyph", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d: MIC })));
  const show = () => {
    if (!button) {
      node.setAttribute("aria-pressed", String(!!take));
      node.classList.toggle("is-on", !!take);
      if (!take && waiting.size) node.setAttribute("aria-busy", "true");
      else node.removeAttribute("aria-busy");
    }
    const state = take ? "recording" : waiting.size ? "transcribing" : learning ? rest : "stopped";
    if (state !== shown && !gone) {
      shown = state;
      onState(state);
    }
  };
  const append = (words) => {
    field.value = field.value ? field.value.replace(/\s*$/, " ") + words : words;
    onText();
  };
  async function playMallet(which) {
    if (!sounds) return;
    const { ear, gain, buffers } = sounds, request = ++cue;
    try {
      if (ear.state === "suspended") void ear.resume().catch(() => {
      });
      const buffer = await buffers[which];
      if (!buffer || request !== cue || gone) return;
      const source = ear.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start();
    } catch {
    }
  }
  function start() {
    if (learning && waiting.size) return;
    const t = { hearing: null, clip: null, draft: "", settled: false };
    take = t;
    rest = "stopped";
    if (Speech) {
      try {
        const hearing = new Speech();
        hearing.lang = "ko-KR";
        hearing.interimResults = false;
        hearing.continuous = true;
        hearing.addEventListener("result", (event) => {
          if (t.settled) return;
          const words = [...event.results].slice(event.resultIndex).filter((result) => result.isFinal).map((result) => result[0].transcript.trim()).join(" ");
          if (words) {
            t.draft = t.draft ? `${t.draft} ${words}` : words;
            append(words);
          }
        });
        const off = () => {
          t.hearing = null;
          if (t.draft || !t.clip) stop(t);
        };
        hearing.addEventListener("end", off);
        hearing.addEventListener("error", off);
        hearing.start();
        t.hearing = hearing;
      } catch {
        t.hearing = null;
      }
    }
    if (records) {
      t.clip = record(media, Recorder, phone && !learning && (() => stop(t))).catch(() => null);
      void t.clip.then((clip) => {
        if (clip) return;
        t.clip = null;
        if (!t.hearing && take === t) {
          rest = "unavailable";
          stop(t);
          if (!gone && !learning) onState("unavailable");
        }
      });
    }
    if (!t.hearing && !t.clip) {
      take = null;
      onState("unavailable");
      return;
    }
    void playMallet("start");
    show();
  }
  function stop(t) {
    if (take !== t) return;
    take = null;
    void playMallet("stop");
    try {
      t.hearing?.stop();
    } catch {
    }
    if (t.clip) {
      const settling = settle(t).finally(() => {
        waiting.delete(settling);
        show();
      });
      waiting.add(settling);
    }
    show();
  }
  async function settle(t) {
    const clip = await t.clip;
    if (!clip) {
      rest = "unavailable";
      return;
    }
    const { blob, ms } = await clip.stop();
    const text = blob.size ? await transcribe(blob, learning ? CEILING_MS : bound(ms)) : "";
    if (!text || gone) {
      rest = "failed";
      return;
    }
    const at = t.draft ? field.value.lastIndexOf(t.draft) : -1;
    if (t.draft && at < 0) return;
    t.settled = true;
    if (at < 0) {
      append(text);
      return;
    }
    field.value = field.value.slice(0, at) + text + field.value.slice(at + t.draft.length);
    onText();
  }
  const { signal } = heard;
  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (take) {
      stop(take);
      return;
    }
    start();
    press = take && { take, at: performance.now() };
  }, { signal });
  const release = () => {
    if (press && performance.now() - press.at >= HOLD_MS) stop(press.take);
    press = null;
  };
  node.addEventListener("pointerup", release, { signal });
  node.addEventListener("pointercancel", release, { signal });
  node.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  node.addEventListener("click", (event) => {
    if (event.detail) return;
    if (take) stop(take);
    else start();
  }, { signal });
  return { node, finish() {
    if (take) stop(take);
    return waiting.size ? Promise.allSettled(waiting) : null;
  }, destroy() {
    gone = true;
    if (button) heard.abort();
    if (take) {
      try {
        take.hearing?.abort?.();
      } catch {
      }
      void take.clip?.then((clip) => clip?.cancel());
      take = null;
    }
  } };
}
