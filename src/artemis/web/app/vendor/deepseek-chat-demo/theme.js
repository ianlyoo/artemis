import { useSyncExternalStore } from "react";
const snapshot = () => document.documentElement.dataset.theme;
const subscribe = (changed) => {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};
export const useTheme = () => useSyncExternalStore(subscribe, snapshot, () => "light");
