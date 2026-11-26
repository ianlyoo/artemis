import { useMemo } from "react";
import { Text } from "@astryxdesign/core/Text";
import { nums, quiet, tone } from "./parts.jsx";
export const heading = (label, n, state) => ({ head: true, key: "head:" + label, label, n, state });
export function rows(list, slices) {
  const by = new Map(slices.map((s) => [s.key, []]));
  for (const r of list) by.get(r.group)?.push(r);
  return slices.flatMap((s) => by.get(s.key).length ? [heading(s.label, s.n, s.state), ...by.get(s.key)] : []);
}
const control = (target, row) => {
  for (let el = target; el && el !== row; el = el.parentElement) {
    if (el.hasAttribute("data-adm-toggle")) return false;
    if (el.matches("button,a,input,select,textarea,[role=button],[tabindex]")) return true;
  }
  return false;
};
const hidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" };
export function useRows({ isOpen, onToggle, panel, phone }) {
  return useMemo(() => ({ rowModel: "grouped", transformHeaderCell: (props) => phone ? { ...props, content: <span style={hidden}>{props.content}</span>, htmlProps: { ...props.htmlProps, style: { ...props.htmlProps.style, paddingBlock: 0, height: 0, borderBottomWidth: 0 } } } : props, transformBodyCell(props, column, r) {
    if (r.head) return { ...props, isContentSuppressed: true };
    return isOpen(r) ? { ...props, htmlProps: { ...props.htmlProps, style: { ...props.htmlProps.style, borderBottomColor: "transparent" } } } : props;
  }, transformBodyRow(props, r) {
    if (r.head) {
      return { ...props, xstyle: [], htmlProps: { ...props.htmlProps, "data-adm-head": r.label }, children: <td colSpan={99} style={{ padding: "var(--spacing-5) var(--spacing-2) var(--spacing-1-5)", borderBottom: "1px solid var(--color-border)" }}>
              <Text type="label" weight="semibold" role="heading" aria-level={3} style={{ display: "inline-flex", alignItems: "baseline", gap: ".5em" }}>
                <span style={{ color: tone(r.state) }}>{r.label}</span><span style={{ ...quiet, ...nums, fontWeight: 400 }}>{r.n}</span>
              </Text>
            </td> };
    }
    const open = isOpen(r);
    return { ...props, htmlProps: { ...props.htmlProps, "data-open": open ? "" : void 0, style: { ...props.htmlProps.style, cursor: "pointer" }, onClick: (e) => {
      props.htmlProps.onClick?.(e);
      if (e.defaultPrevented || control(e.target, e.currentTarget) || String(globalThis.getSelection?.() ?? "")) return;
      onToggle(r.key);
    } }, afterRow: open ? <>
            {props.afterRow}
            <tr data-panel={r.key}>
              <td colSpan={99} style={{ padding: "0 var(--spacing-2)", borderBottom: "1px solid var(--color-border)" }}>{panel(r)}</td>
            </tr>
          </> : props.afterRow };
  } }), [isOpen, onToggle, panel, phone]);
}
