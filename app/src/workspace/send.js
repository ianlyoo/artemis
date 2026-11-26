import { feed } from "../chat/feed.js";
import { SEND_LIMITS } from "../chat/store.js";
import { stateLine } from "../chat/view.js";
import { looksSecret } from "./core.js";
export const SENDING = "Sending…", SENT = "Sent · it is in the chat";
export const TOO_LONG = "Too long for one message (over 20,000 characters) · nothing was sent";
let chatStore = null;
export const useChatStore = (store) => {
  chatStore = store;
};
export function createSender({ store = () => chatStore ?? feed.store } = {}) {
  let flight = null;
  async function attempt({ text, images = [] }, { secret = text, secretLine = "It looks like it holds a secret · nothing was sent", onState = () => {
  } }) {
    const chat = store();
    if (looksSecret(secret)) return { ok: false, error: "secret", line: secretLine };
    if (text.length > SEND_LIMITS.text) return { ok: false, error: "too_long", line: TOO_LONG };
    const blocked = stateLine(chat);
    if (blocked) return { ok: false, error: "not_ready", line: blocked };
    onState({ state: "sending", line: SENDING });
    const sent = await chat.send(images.length ? { text, images } : { text });
    return sent.ok ? { ok: true, id: sent.id, key: sent.key, line: SENT } : { ok: false, id: sent.id ?? null, error: sent.error ?? "failed", line: sent.line ?? "Couldn't send" };
  }
  return { get busy() {
    return !!flight;
  }, send(message, options = {}) {
    flight ??= attempt(message, options).catch((error) => {
      console.error("Send:", error);
      return { ok: false, error: "failed", line: "Couldn't send" };
    }).finally(() => {
      flight = null;
    });
    return flight;
  } };
}
