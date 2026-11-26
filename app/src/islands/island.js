const sheet = new URL("./islands.css", import.meta.url).href;
const styled = new Map();
function stylesheet(href = sheet) {
  if (styled.has(href)) return styled.get(href);
  const loading = new Promise((done, fail) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
    link.onload = done;
    link.onerror = () => {
      styled.delete(href);
      link.remove();
      fail(new Error("islands.css did not load"));
    };
    document.head.append(link);
  });
  styled.set(href, loading);
  return loading;
}
export async function mountIsland(name, host, props = {}) {
  globalThis.homePreload?.(`islands/${name}.js`);
  const [module] = await Promise.all([import(new URL(`./${name}.js`, import.meta.url).href), stylesheet()]);
  if (module.stylesheet) await stylesheet(module.stylesheet);
  host.setAttribute("data-astryx-island", name);
  const island = module.mount(host, props);
  return { update: island.update, unmount() {
    island.unmount();
    host.removeAttribute("data-astryx-island");
  } };
}
