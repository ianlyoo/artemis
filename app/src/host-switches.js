import { esc, glyph, when, koDayCount } from "./mobile/format.js";
import { hostId } from "./pc-data.js";
import { iconButton } from "./icons.js";
import { hosts as serverHosts } from "./names.js";
const SIGN_IN = "로그인이 필요해요. 다시 로그인해 주세요.", NOT_CHANGED = "변경하지 못했어요. 다시 시도해 주세요.";
export function hostRows(d) {
  return (d.resources?.hosts || []).map((h) => ({ ...h, label: d.host_labels?.[h.key] || d.hosts?.[h.key]?.label || h.label || h.key }));
}
export function hostWork(row) {
  const counts = row.occupancy?.counts || row.occupancy || {}, count = (n) => Number.isInteger(n) && n >= 0 ? n : null;
  const active = count(counts.active), running = count(counts.busy), jobs = count(row.running_jobs);
  const idle = active !== null && running !== null ? Math.max(0, active - running) : null;
  const cap = (key) => Number.isFinite(row.eco_caps?.[key]) ? row.eco_caps[key] : 25;
  const short = (value) => {
    const text = String(value || "작업 중").replace(/\s+/g, " ").trim();
    return text.length > 80 ? text.slice(0, 80) + "…" : text;
  };
  const runs = (row.jobs || []).map((j) => (j.kind || "run") + " · " + short(j.label));
  return { work: `Agents · ${running ?? "—"} running · ${idle ?? "—"} idle · Jobs · ${jobs ?? "—"} running`, details: runs.length ? [`실행 중인 작업 ${runs.length}개`, ...runs] : [], eco: row.eco === true ? `Eco · CPU ${cap("cpu_pct")} % · RAM ${cap("ram_pct")} % · VRAM ${cap("vram_pct")} %` : null };
}
export function hostWorkHTML(row) {
  const { work, eco } = hostWork(row);
  return '<div class="host-work">' + esc(work) + "</div>" + (eco ? '<div class="host-eco">' + esc(eco) + "</div>" : "");
}
export function hostHealth(row, now = Date.now()) {
  const state = row?.state || "unknown", health = row?.health || "warning";
  const show = (state === "off" || state === "unreachable") && row?.last_report_at;
  const days = show ? koDayCount(row.last_report_at, now) : "";
  const last = show ? " · " + when(row.last_report_at, now) + (days ? " · " + days : "") : "";
  return { health, asleep: state === "asleep", muted: row?.muted === true, status: state === "online" && typeof row?.compute === "boolean" ? powerText(row) : (health === "running" ? glyph(health) + " " : "") + (row?.label_text ?? "—") + last };
}
function powerText(row) {
  const why = row.power?.ac === false ? "충전 중 아님" : row.power?.home === false ? "집 밖" : null;
  return "켜짐/연결 · " + (row.compute ? "연산 가능" : "연산 안 함" + (why ? " (" + why + ")" : ""));
}
const mode = (state) => state?.available === false ? "off" : state?.eco === true ? "eco" : "on";
const draining = (state) => state?.drain?.state === "done" ? [] : state?.draining || [];
const drainLabel = (state, agents) => {
  const jobs = state.drain?.state === "done" ? 0 : state.running_jobs || 0;
  const counts = [jobs ? jobs + (jobs === 1 ? " job" : " jobs") : null, agents ? agents + (agents === 1 ? " agent" : " agents") : null].filter(Boolean);
  return counts.length ? "Draining · " + counts.join(" · ") : "Off" + (state.drain?.stopped ? " · " + state.drain.stopped + " stopped" : "");
};
export function restingHosts(d) {
  return new Set(hostRows(d).filter((h) => hostHealth(h).health === "idle").map((h) => h.key));
}
export function hostMetrics(row, gpus, muted = false) {
  const d = row.data || {}, ratio = typeof d.load === "number" && d.cpus ? d.load / d.cpus : null, id = hostId(row.key);
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0)), none = (text) => muted ? "—" : text;
  const gpu = id.startsWith("win-") ? (gpus || []).find((g) => hostId(g.key) === id)?.data || {} : null;
  return { muted, cpus: "Load / " + (d.cpus || "—") + " CPU", load: ratio === null ? none("N/A") : ratio.toFixed(2) + "×", loadValue: ratio === null ? 0 : clamp(ratio * 100), high: !muted && ratio > 1, mem: typeof d.mem_free_gb === "number" ? d.mem_free_gb.toFixed(1) + " GB" : none("— GB"), last: gpu ? { label: "GPU", value: Number.isFinite(gpu.util) ? Math.round(gpu.util) + "%" : "—", meter: clamp(gpu.util), free: Number.isFinite(gpu.mem_free_mb) ? Math.round(gpu.mem_free_mb / 1024) + " GB free" : none("— GB free") } : { label: "Disk", value: typeof d.disk_used_pct === "number" ? d.disk_used_pct.toFixed(1) + "%" : none("—%"), meter: clamp(d.disk_used_pct) } };
}
const iconAction = (action, name, label, title) => iconButton('data-host-action="' + action + '"', name, label, action === "off" ? "is-bad" : "", title);
const ECO_ICON = "leaf";
const MUTE_WAIT = 3e4, mainHost = () => serverHosts().main;
const MUTE_OFF = "꺼져 있어서 음소거를 바꿀 수 없어요.", MUTE_ASLEEP = "잠자기 중이라 음소거를 바꿀 수 없어요.";
const MUTE_FAILED = "음소거를 바꾸지 못했어요. 다시 시도해 주세요.", MUTE_UNREACHED = "연결하지 못했어요. 다시 시도해 주세요.";
const MUTE_SLOW = "아직 답이 없어요. 잠시 뒤 다시 확인해 주세요.";
export function muteBlocked(state, rest) {
  return state?.available === false || rest?.health === "idle" && !rest?.asleep ? MUTE_OFF : rest?.asleep ? MUTE_ASLEEP : null;
}
export function muteControl(label, muted, blocked, pending) {
  return { icon: muted === true ? "volume-off" : "volume", pressed: muted === true, label: label + " 음소거" + (blocked ? " · " + blocked : ""), title: blocked || (pending ? "음소거를 바꾸는 중이에요…" : muted === true ? "음소거 중이에요. 누르면 소리를 켜요." : muted === false ? "소리가 켜져 있어요. 누르면 음소거해요." : "음소거 상태를 아직 몰라요. 누르면 음소거해요.") };
}
export function createHostSwitches(api, render, { button: make = iconAction } = {}) {
  let hosts = {}, controller = null, mute = {}, shownBlocked = null;
  const edits = new Map();
  const dropMute = () => {
    clearTimeout(mute.timer);
    mute = {};
  };
  const muteFail = (press, error) => {
    if (mute !== press) return;
    dropMute();
    mute = { error };
    render();
  };
  const drop = (host) => {
    clearTimeout(edits.get(host)?.timer);
    return edits.delete(host);
  };
  const fail = (host, edit, error) => {
    if (edits.get(host) !== edit) return;
    drop(host);
    if (!edit.confirmed) edits.set(host, { error });
    render();
  };
  return { observe(next, controllerId) {
    controller = controllerId;
    const previous = hosts;
    hosts = next || {};
    let changed = false;
    for (const [host, edit] of edits) {
      if (edit.pending) {
        if (mode(hosts[host]) === mode(edit)) edit.confirmed = true;
        if (edit.sent) {
          drop(host);
          changed = true;
        }
      } else if (mode(hosts[host]) !== mode(previous[host])) {
        drop(host);
        changed = true;
      }
    }
    const audio = hosts[mainHost()]?.audio, before = previous[mainHost()]?.audio;
    if (mute.held && audio?.muted === mute.muted) {
      dropMute();
      changed = true;
    } else if (!mute.pending && !mute.held && (mute.why || mute.error) && (audio?.muted !== before?.muted || hosts[mainHost()]?.available !== previous[mainHost()]?.available)) {
      dropMute();
      changed = true;
    }
    return changed;
  }, html(host, rest) {
    const state = hosts[host];
    if (!controller || host === controller || typeof state?.available !== "boolean") return "";
    const edit = edits.get(host) || {}, label = state.label || host, remaining = draining(state);
    const button = (action, name, text) => make(action, name, label + " " + text, text);
    const eco = state.available && host === mainHost() ? make("eco", ECO_ICON, label + " Eco", state.eco ? "Turn Eco off" : "Turn Eco on").replace("<button ", '<button aria-pressed="' + (state.eco === true) + '" ') : "";
    const blocked = host === mainHost() ? muteBlocked(state, rest) : null, busy = !!(mute.pending || mute.held);
    if (host === mainHost()) shownBlocked = blocked;
    const sound = host === mainHost() ? muteControl(label, busy ? mute.muted : state.audio?.muted, blocked, mute.pending) : null;
    const muteButton = sound ? make("mute", sound.icon, sound.label, sound.title).replace("<button ", '<button aria-pressed="' + sound.pressed + '"' + (blocked || mute.pending ? ' aria-disabled="true"' : "") + (mute.pending ? ' aria-busy="true"' : "") + " ") : "";
    return '<div class="host-switch" data-host="' + esc(host) + '" data-available="' + state.available + '" data-mode="' + mode(state) + '" aria-label="' + esc(label + " new work") + '" aria-busy="' + !!edit.pending + '"><div class="host-availability"><span class="host-availability-state" role="status">' + (edit.pending ? edit.eco ? "Entering Eco…" : edit.leave ? "Leaving Eco…" : edit.available ? "Turning on…" : "Turning off…" : state.available ? state.eco ? "Eco" : host === mainHost() ? "On" : "In use" : drainLabel(state, remaining.length)) + '</span><span class="host-actions">' + (edit.pending ? "" : edit.confirm ? button("off", "check", "Confirm turn off") + button("cancel", "close", "Cancel") : muteButton + eco + button(state.available ? "confirm" : "on", "power", state.available ? "Turn off" : "Turn on")) + "</span></div>" + (edit.confirm ? '<p class="host-switch-note">Artemis 작업을 2분 안에 정리하고, 다시 켤 때까지 이 기기에 접속하지 않아요.</p>' : "") + (edit.error ? '<p class="host-switch-error" role="alert">' + esc(edit.error) + "</p>" : "") + (host === mainHost() && mute.why && blocked ? '<p class="host-switch-note host-mute-note" role="status">' + esc(blocked) + "</p>" : "") + (host === mainHost() && mute.error ? '<p class="host-switch-error host-mute-error" role="alert">' + esc(mute.error) + "</p>" : "") + (!state.available && remaining.length ? '<div class="host-remaining"><ul>' + remaining.map((a) => '<li><span class="host-agent-role">' + esc(a.role) + '</span> <span class="host-agent-title">' + esc(a.title || a.id) + '</span> <span class="host-agent-busy">' + (a.busy ? "Busy" : "Idle") + "</span></li>").join("") + "</ul></div>" : "") + "</div>";
  }, click(event) {
    const button = event.target.closest("[data-host-action]");
    if (!button) return !!event.target.closest(".host-switch");
    event.preventDefault();
    const host = button.closest("[data-host]").dataset.host, state = hosts[host], action = button.dataset.hostAction;
    if (!controller || host === controller || typeof state?.available !== "boolean" || edits.get(host)?.pending) return true;
    if (action === "mute") return pressMute(host, state);
    if (action === "cancel") {
      drop(host);
      render();
      return true;
    }
    if (action === "confirm") {
      edits.set(host, { confirm: true });
      render();
      return true;
    }
    if (action === "off" && !edits.get(host)?.confirm) return true;
    if (!["on", "eco", "off"].includes(action) || action === "eco" && (host !== mainHost() || !state.available)) return true;
    const leave = action === "eco" && state.eco === true, edit = { pending: true, available: action !== "off", eco: action === "eco" && !leave, leave, sent: false, confirmed: false };
    edits.set(host, edit);
    render();
    edit.timer = setTimeout(() => fail(host, edit, "변경을 확인하지 못했어요. 다시 시도해 주세요."), 3e4);
    Promise.resolve().then(() => api("/hosts/" + encodeURIComponent(host) + "/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available: edit.available, ...host === mainHost() ? { eco: edit.eco } : {} }) })).then((response) => {
      if (edits.get(host) !== edit) return;
      if (!response.ok) throw Error(response.status === 401 ? SIGN_IN : NOT_CHANGED);
      edit.sent = true;
      if (edit.confirmed) drop(host);
      render();
    }).catch((error) => fail(host, edit, error?.message === SIGN_IN ? SIGN_IN : NOT_CHANGED));
    return true;
  } };
  function pressMute(host, state) {
    if (host !== mainHost() || mute.pending) return true;
    if (shownBlocked || state.available === false) {
      dropMute();
      mute = { why: true };
      render();
      return true;
    }
    const muted = (mute.held ? mute.muted : state.audio?.muted) !== true, press = { pending: true, muted };
    dropMute();
    mute = press;
    render();
    Promise.resolve().then(() => api("/hosts/" + encodeURIComponent(host) + "/mute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ muted }) })).then(async (response) => {
      if (mute !== press) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(response.status === 401 ? SIGN_IN : body?.error === "host_off" ? MUTE_OFF : body?.error === "host_offline" ? MUTE_UNREACHED : response.status === 504 ? MUTE_SLOW : MUTE_FAILED);
      }
      press.pending = false;
      press.held = true;
      press.timer = setTimeout(() => {
        if (mute === press) {
          dropMute();
          render();
        }
      }, MUTE_WAIT);
      if (hosts[mainHost()]?.audio?.muted === muted) dropMute();
      render();
    }).catch((error) => muteFail(press, [SIGN_IN, MUTE_OFF, MUTE_UNREACHED, MUTE_SLOW].includes(error?.message) ? error.message : MUTE_FAILED));
    return true;
  }
}
