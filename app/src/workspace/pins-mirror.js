import { postJSON, paths, homeApi } from "./api.js";
import { on, lists, saved } from "./core.js";
import { has } from "../names.js";
export function deviceId(store = saved, random = () => crypto.randomUUID()) {
  let id = store.read("device", null);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = random().replace(/[^A-Za-z0-9_-]/g, "");
    store.write("device", id);
  }
  return id;
}
export const pinsOut = (pins) => pins.filter((pin) => pin.kind === "board" || pin.kind === "file").map((pin) => pin.kind === "board" ? { kind: "board", id: pin.id } : { kind: "file", path: pin.path });
export function mirrorPins({ api = homeApi, post = postJSON, list = lists(), store = saved, wait = 800 } = {}) {
  if (!has("archive")) return () => {
  };
  const device = deviceId(store);
  let timer = 0, last = null;
  const send = () => {
    timer = 0;
    const pins = pinsOut(list.pins()), key = JSON.stringify(pins);
    if (key === last) return;
    last = key;
    void post(api, paths.pins(), { device, pins }).then((answer) => {
      if (!answer.ok) last = null;
    }, () => {
      last = null;
    });
  };
  send();
  const off = on("pins", () => {
    clearTimeout(timer);
    timer = setTimeout(send, wait);
  });
  return () => {
    clearTimeout(timer);
    off();
  };
}
