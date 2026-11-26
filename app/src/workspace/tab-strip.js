export function keyedNodes(list) {
  const made = new Map();
  return { place(keys, make) {
    const wanted = new Set(keys);
    for (const [key, item] of made) if (!wanted.has(key)) {
      item.node.remove();
      made.delete(key);
    }
    let at = list.firstChild;
    for (const key of wanted) {
      let item = made.get(key);
      if (!item) {
        item = make(key);
        made.set(key, item);
      }
      if (item.node === at) at = at.nextSibling;
      else list.insertBefore(item.node, at);
    }
    return made;
  } };
}
