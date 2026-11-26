import { feed } from "./feed.js";
import { lead, ledgerRef } from "../names.js";
let styles = null;
export function loadStyles(doc = document) {
  if (styles) return styles;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./chat.css", import.meta.url).href;
  styles = new Promise((resolve) => {
    link.addEventListener("load", () => resolve(true), { once: true });
    link.addEventListener("error", () => resolve(false), { once: true });
  });
  doc.head.append(link);
  return styles;
}
export const PROBLEM_STATES = Object.freeze(["offline", "no_target", "version_mismatch"]);
export const entryState = (state, turn) => PROBLEM_STATES.includes(state?.state) ? "problem" : turn?.running ? "running" : "";
const TOOL_LINES = [[/^Read$/, "Reading a file"], [/^(Grep|Glob)$/, "Searching files"], [/^(Edit|MultiEdit|Write|NotebookEdit)$/, "Editing a file"], [/^Bash$/, "Running a command"], [/^WebSearch$/, "Searching the web"], [/^WebFetch$/, "Reading a web page"], [{ test: (name) => name.startsWith("mcp__company__") || name.startsWith(`mcp__${ledgerRef()}__`) }, "Checking the ledger"]];
export const TURN_LINES = Object.freeze({ get answering() {
  return `${lead()} is answering`;
}, thinking: "Thinking", tool: "Using a tool" });
export function turnLine(turn, name = lead()) {
  const activity = turn?.activity;
  if (activity?.kind === "tool") return TOOL_LINES.find(([name2]) => name2.test(activity.tool ?? ""))?.[1] ?? TURN_LINES.tool;
  return activity?.kind === "thinking" ? TURN_LINES.thinking : `${name} is answering`;
}
export function wireEntry(button, store = feed.store) {
  loadStyles();
  const paint = () => {
    const now = entryState(store.state, store.turn);
    if ((button.dataset.chat ?? "") !== now) {
      if (now) button.dataset.chat = now;
      else delete button.dataset.chat;
    }
    button.title = now === "running" ? turnLine(store.turn) : now === "problem" ? store.state.line ?? `Disconnected from ${lead()}` : `Chat with ${lead()}`;
  };
  paint();
  return store.subscribe((event) => {
    if (["turn", "state", "snapshot", "reset"].includes(event.type)) paint();
  });
}
