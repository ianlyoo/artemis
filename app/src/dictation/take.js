export const recognition = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;
export const TAKES = "/dictation/takes";
export async function onDeviceAnswer(Recognition = recognition()) {
  if (typeof Recognition?.available !== "function") return "no-api";
  try {
    return String(await Recognition.available({ langs: ["ko-KR"], processLocally: true }));
  } catch (error) {
    return `error: ${error?.name ?? error}`;
  }
}
const tidy = (text) => text.replace(/\s+/g, " ").trim();
export function listen(track, { Recognition = recognition(), lang = "ko-KR", now = () => performance.now(), settle = 1e4 } = {}) {
  if (!Recognition) {
    const none = Promise.resolve({ text: "", pending: "", error: "no-api", ms: null });
    return { result: none, t0: now(), stop: () => none, abort: () => none };
  }
  const rec = new Recognition();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  const t0 = now();
  let text = "", pending = "", error = "", last = null;
  rec.onresult = (event) => {
    pending = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        text += event.results[i][0].transcript;
        last = now();
      } else pending += event.results[i][0].transcript;
    }
  };
  rec.onerror = (event) => {
    error ||= event.error || "error";
  };
  const result = new Promise((done) => {
    rec.onend = () => done({ text: tidy(text), pending: tidy(pending), error, ms: last === null ? null : Math.round(last - t0) });
  });
  try {
    rec.start(track);
  } catch {
    try {
      rec.start();
    } catch (e) {
      error = `start: ${e?.name ?? e}`;
      rec.onend();
    }
  }
  return { result, t0, stop() {
    try {
      rec.stop();
    } catch {
    }
    const cap = setTimeout(() => {
      try {
        rec.abort();
      } catch {
      }
    }, settle);
    return result.finally(() => clearTimeout(cap));
  }, abort() {
    try {
      rec.abort();
    } catch {
    }
    return result;
  } };
}
export async function replay(source, { Recognition = recognition(), tail = 1500, Audio = globalThis.Audio, now = () => performance.now() } = {}) {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const audio = new Audio(url);
  audio.muted = true;
  try {
    await new Promise((ready, fail) => {
      audio.addEventListener("canplaythrough", ready, { once: true });
      audio.addEventListener("error", () => fail(new Error("audio-decode")), { once: true });
    });
    const stream = audio.captureStream();
    if (!stream.getAudioTracks().length) await new Promise((added) => stream.addEventListener("addtrack", added, { once: true }));
    const pass = listen(stream.getAudioTracks()[0], { Recognition, now });
    const ended = new Promise((done) => audio.addEventListener("ended", done, { once: true }));
    await audio.play();
    await ended;
    const audio_ms = Math.round(now() - pass.t0);
    await new Promise((wait) => setTimeout(wait, tail));
    return { ...await pass.stop(), audio_ms };
  } catch (error) {
    return { text: "", pending: "", error: String(error?.message ?? error), ms: null, audio_ms: null };
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    if (url !== source) URL.revokeObjectURL(url);
  }
}
export const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
export const PLAIN = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
export async function startTake({ media = globalThis.navigator?.mediaDevices, Recorder = globalThis.MediaRecorder, Recognition = recognition(), replayTake = replay, now = () => performance.now() } = {}) {
  const stream = await media.getUserMedia({ audio: PLAIN });
  const type = TYPES.find((t) => Recorder.isTypeSupported?.(t)) ?? "";
  const recorder = new Recorder(stream, type ? { mimeType: type } : void 0);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  const recorded = new Promise((done) => {
    recorder.onstop = done;
  });
  const started_at = (new Date()).toISOString(), t0 = now();
  recorder.start();
  const live = listen(stream.getAudioTracks()[0], { Recognition, now });
  return { started_at, async stop() {
    const duration_ms = Math.round(now() - t0), ended_at = (new Date()).toISOString();
    recorder.stop();
    const [heard] = await Promise.all([live.stop(), recorded]);
    for (const track of stream.getTracks()) track.stop();
    const blob = new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" });
    const again = heard.text ? null : await replayTake(blob, { Recognition });
    const mode = heard.text ? "live" : again.text ? "replay" : "none";
    return { blob, mime: blob.type, mode, transcript: heard.text || again.text, live: heard, replay: again, started_at, ended_at, duration_ms };
  }, cancel() {
    live.abort();
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
  } };
}
async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export async function sendTake({ session, sentence, take, onDevice }, { fetch: send = globalThis.fetch } = {}) {
  const { blob, ...rest } = take;
  const response = await send(TAKES, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rest, session, sentence, audio: await base64(blob), on_device: onDevice }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body;
}
export async function readTakes(session, { fetch: send = globalThis.fetch } = {}) {
  const response = await send(`${TAKES}?session=${encodeURIComponent(session)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()).takes ?? [];
}
export function sessionId(store = globalThis.localStorage, today = new Date()) {
  const key = "artemis-dictation-session";
  let id = null;
  try {
    id = store?.getItem(key);
  } catch {
  }
  if (/^[a-z0-9-]{8,64}$/.test(id ?? "")) return id;
  id = `${today.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    store?.setItem(key, id);
  } catch {
  }
  return id;
}
