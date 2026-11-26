export function placeDocBlocks(parent, nodes) {
  const keep = new Set(nodes);
  for (const child of [...parent.childNodes]) if (!keep.has(child)) child.remove();
  let cursor = parent.firstChild;
  for (const node of nodes) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    if (parent.moveBefore && node.parentNode === parent && parent.isConnected) parent.moveBefore(node, cursor);
    else parent.insertBefore(node, cursor);
  }
}
