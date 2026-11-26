import { flushSync } from "react-dom";
import { island } from "./lib/mount.jsx";
import { Board } from "./admin/board.jsx";
import { Overview } from "./admin/overview.jsx";
import { Rail } from "./admin/rail.jsx";
export function Admin({ part, ...props }) {
  return part === "rail" ? <Rail {...props} /> : part === "overview" ? <Overview {...props} /> : <Board {...props} />;
}
const draw = island(Admin);
export const mount = (host, props) => {
  const it = draw(host, props);
  return { update: (next) => flushSync(() => it.update(next)), unmount: it.unmount };
};
