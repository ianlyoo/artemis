import { icon } from "../mobile/icons.js";
const permissionLine = (permission) => permission === "denied" ? "기기 설정에서 알림을 허용해 주세요" : "알림이 꺼져 있어요";
export function supported(env = globalThis) {
  return !!(env.isSecureContext && env.Notification && env.PushManager && env.navigator?.serviceWorker);
}
const bytes = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const QUIET = new Set(["알림 상태를 확인하는 중이에요", "알림이 켜져 있어요", "알림이 꺼져 있어요", "알림을 설정하는 중이에요"]);
export function mountPush(dialog, env = globalThis) {
  if (!dialog.querySelector("[data-push]")) dialog.querySelector(".m-theme")?.insertAdjacentHTML?.("afterend", '<button type="button" class="m-icon m-push" data-push aria-label="Notifications" aria-pressed="false" hidden></button><span class="m-push-line" data-push-status role="status" hidden></span>');
  const button = dialog.querySelector("[data-push]"), line = dialog.querySelector("[data-push-status]");
  if (typeof button?.addEventListener !== "function" || !line) return;
  let enabled = false, busy = false, registration, status;
  const paint = (text) => {
    const name = enabled ? "Notifications on" : "Notifications off";
    if (button.title !== name) {
      button.innerHTML = icon(enabled ? "bell" : "bell-off");
      button.title = name;
      button.setAttribute("aria-pressed", String(enabled));
    }
    button.disabled = busy;
    line.textContent = text;
    line.hidden = QUIET.has(text);
  };
  button.hidden = !supported(env);
  if (!button.hidden) paint("알림 상태를 확인하는 중이에요");
  const request = async (path, init) => {
    const result = await env.fetch("/api/notify/" + path, { credentials: "same-origin", cache: "no-store", ...init });
    if (!result.ok) throw Error("notify_unavailable");
    return result.json();
  };
  const refresh = async () => {
    if (!supported(env)) return;
    try {
      status = await request("status");
      registration = await env.navigator.serviceWorker.register("/push-worker.js", { scope: "/", updateViaCache: "none" });
      registration = await env.navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      enabled = !!(sub && status.subscribed && env.Notification.permission === "granted");
      paint(enabled ? "알림이 켜져 있어요" : permissionLine(env.Notification.permission));
    } catch {
      paint("알림 상태를 확인하지 못했어요. 다시 눌러 주세요");
    }
  };
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || !supported(env)) return;
    busy = true;
    const permission = enabled ? null : env.Notification.requestPermission();
    paint("알림을 설정하는 중이에요");
    try {
      if (enabled) {
        await request("subscribe", { method: "DELETE" });
        const sub = await registration?.pushManager.getSubscription();
        await sub?.unsubscribe();
        enabled = false;
        paint("알림이 꺼져 있어요");
      } else {
        if (await permission !== "granted") {
          paint(permissionLine(env.Notification.permission));
          return;
        }
        status = await request("status");
        registration ??= await env.navigator.serviceWorker.register("/push-worker.js", { scope: "/", updateViaCache: "none" });
        registration = await env.navigator.serviceWorker.ready;
        let sub = await registration.pushManager.getSubscription();
        const key = bytes(status.publicKey);
        if (sub && (!status.subscribed || sub.options?.applicationServerKey && String(new Uint8Array(sub.options.applicationServerKey)) !== String(key))) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await request("subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
        enabled = true;
        paint("알림이 켜져 있어요");
      }
    } catch {
      paint("알림을 설정하지 못했어요. 다시 눌러 주세요");
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  void refresh();
}
