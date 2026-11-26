export function closeShortcut(event, close = () => {
}) {
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "w") return false;
  if (!event.metaKey && (!event.ctrlKey || event.target?.closest?.(".ide-term-body"))) return false;
  event.preventDefault();
  if (!event.repeat) close();
  return true;
}
