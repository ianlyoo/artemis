import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
export function island(Component) {
  return (host, props) => {
    const root = createRoot(host);
    let current = props;
    flushSync(() => root.render(<Component {...current} />));
    return { update(next) {
      current = { ...current, ...next };
      root.render(<Component {...current} />);
    }, unmount() {
      root.unmount();
    } };
  };
}
