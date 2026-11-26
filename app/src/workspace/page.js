export { createPageStream } from "../stream.js";
export function chatTurns() {
  let gone = Promise.resolve();
  return { mount: (fn) => gone.then(fn), down(turn) {
    if (turn) gone = gone.then(() => turn).then((off) => {
      if (typeof off === "function") off();
    }).catch(() => {
    });
  } };
}
