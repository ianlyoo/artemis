import { el } from "../boards/dom.js";
import { iconButton } from "../workspace/icons.js";
import { hosts as serverHosts } from "../names.js";
const ERRORS = { invalid_path: "폴더의 절대 경로를 입력해 주세요", studio_directory_permission_denied: "이 호스트에서 작업실을 열 권한(workspace.manage)이 없어요", invalid_title: "제목은 한 줄, 80자까지예요", creation_conflict: "앞선 생성 요청과 설정이 달라요", studio_roster_timeout: "작업실 등록이 늦어지고 있어요. 다시 누르면 같은 작업실을 확인해요", studio_create_timeout: "작업실 응답이 늦어지고 있어요. 같은 설정으로 다시 눌러 주세요", studio_daemon_unavailable: "이 호스트의 Paseo에 연결하지 못했어요", version_mismatch: "이 호스트의 Paseo 버전이 아직 확인되지 않았어요", studio_provider_missing: "이 호스트의 Paseo에 작업실 설정이 아직 없어요", offline: "연결이 끊겼어요. 다시 눌러 주세요" };
const OPTIONS_FAILED = "모델·호스트 목록을 받지 못했어요. 이대로 열면 기본값으로 열려요";
const STATUS_MS = 6e3;
const failure = (message) => ERRORS[message] ?? (/^studio_(?:directory|create)_failed: /.test(message) ? `작업실을 열지 못했어요: ${message.replace(/^studio_(?:directory|create)_failed: /, "")}` : `작업실을 열지 못했어요 (${message}). 다시 눌러 주세요`);
export function createStudioEntry({ agents, select, onOpen = () => {
}, restoreFocus = null, uuid = () => crypto.randomUUID().replaceAll("-", "") }) {
  const button = iconButton("plus", "새 작업실", { class: "studio-new" });
  const settings = iconButton("M4 7h10 M18 7h2 M14 4v6 M4 17h2 M10 17h10 M10 14v6", "작업실 설정", { class: "studio-settings", "aria-expanded": "false" });
  const status = el("div", { class: "studio-status", role: "status", hidden: true });
  const title = el("input", { type: "text", placeholder: "비워 두면 첫 메시지로 정해져요", "aria-label": "제목", autocomplete: "off", maxlength: "80" });
  const first = serverHosts().studio, host = el("select", { "aria-label": "호스트" }, ...first ? [el("option", { value: first }, first)] : []);
  const path = el("input", { type: "text", placeholder: "비워 두면 새 폴더", "aria-label": "기존 폴더 경로", autocomplete: "off" });
  const model = el("select", { "aria-label": "모델" });
  const effort = el("select", { "aria-label": "생각 깊이" }, ["낮게", "보통", "높게", "더 높게", "최대로"].map((label2, i) => el("option", { value: ["low", "medium", "high", "xhigh", "max"][i] }, label2)));
  host.value = first ?? "";
  effort.value = "medium";
  const close = iconButton("close", "닫기", { class: "studio-close" });
  const submit = el("button", { type: "submit", class: "studio-create" }, "이 설정으로 열기");
  const note = el("p", { class: "studio-sheet-note", role: "status", hidden: true });
  const label = (text, field) => el("label", {}, el("span", {}, text), field);
  const sheet = el("form", { class: "studio-sheet", hidden: true, "aria-label": "작업실 설정" }, el("div", { class: "studio-sheet-head" }, el("span", {}, "작업실 설정"), close), label("제목", title), label("호스트", host), label("기존 폴더", path), label("모델", model), label("생각 깊이", effort), note, submit);
  const controls = el("div", { class: "studio-controls" }, button, settings);
  const node = el("div", { class: "studio-entry" }, controls, sheet, status);
  let pending = false, attempt = null, gone = false, statusTimer = 0;
  const hideStatus = () => {
    clearTimeout(statusTimer);
    status.hidden = true;
  };
  const hideLater = () => {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, STATUS_MS);
  };
  status.addEventListener("pointerenter", () => clearTimeout(statusTimer));
  status.addEventListener("pointerleave", () => {
    if (!status.hidden) hideLater();
  });
  status.addEventListener("click", hideStatus);
  const clearNotice = () => {
    hideStatus();
    note.hidden = true;
  };
  const toggle = (open) => {
    clearNotice();
    sheet.hidden = !open;
    settings.setAttribute("aria-expanded", String(open));
    if (open) title.focus();
  };
  const notice = (text) => {
    if (!sheet.hidden) {
      note.textContent = text;
      note.hidden = false;
      return;
    }
    status.textContent = text;
    status.hidden = false;
    hideLater();
  };
  async function create(options = {}) {
    if (pending) return;
    const signature = JSON.stringify(options);
    if (attempt?.signature !== signature) attempt = { signature, creationId: uuid() };
    pending = true;
    button.disabled = submit.disabled = settings.disabled = true;
    clearNotice();
    try {
      const result = await agents.createStudio({ creationId: attempt.creationId, ...options });
      if (gone) return;
      await select(result.agentId, { focus: true });
      attempt = null;
      toggle(false);
      title.value = "";
    } catch (error) {
      if (!gone) notice(failure(String(error?.message ?? "offline")));
    } finally {
      pending = false;
      button.disabled = submit.disabled = settings.disabled = false;
    }
  }
  button.addEventListener("click", () => {
    void create();
  });
  settings.addEventListener("click", () => {
    if (sheet.hidden) onOpen();
    toggle(sheet.hidden);
    if (!sheet.hidden) void agents.studioOptions().then(({ hosts, models }) => {
      if (gone) return;
      const selectedModel = model.value;
      model.replaceChildren(...models.map((m) => el("option", { value: m.id }, m.label)));
      model.value = models.some((m) => m.id === selectedModel) ? selectedModel : models[0]?.id ?? "";
      const selected = host.value;
      host.replaceChildren(...hosts.map((id) => el("option", { value: id }, id)));
      host.value = hosts.includes(selected) ? selected : hosts[0] ?? "";
    }).catch(() => {
      if (!gone) notice(OPTIONS_FAILED);
    });
  });
  const focusTrigger = () => restoreFocus ? restoreFocus() : settings.focus();
  close.addEventListener("click", () => {
    toggle(false);
    focusTrigger();
  });
  sheet.addEventListener("submit", (event) => {
    event.preventDefault();
    void create({ ...title.value.trim() ? { title: title.value.trim() } : {}, ...host.value ? { host: host.value } : {}, ...path.value.trim() ? { path: path.value.trim() } : {}, ...model.value ? { model: model.value } : {}, thinking: effort.value });
  });
  const outside = (event) => {
    if (node.contains(event.target) || controls.contains(event.target)) return;
    if (!sheet.hidden) toggle(false);
    if (!status.hidden) hideStatus();
  };
  document.addEventListener("pointerdown", outside);
  const keys = (event) => {
    if (event.key !== "Escape") return;
    if (!status.hidden) {
      event.stopPropagation();
      hideStatus();
    }
    if (!sheet.hidden) {
      event.stopPropagation();
      toggle(false);
      focusTrigger();
    }
  };
  node.addEventListener("keydown", keys);
  controls.addEventListener("keydown", keys);
  return { node, controls, notice, destroy() {
    gone = true;
    clearTimeout(statusTimer);
    document.removeEventListener("pointerdown", outside);
    controls.remove();
    node.remove();
  } };
}
