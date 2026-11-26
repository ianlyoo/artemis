export function prepareControls(root) {
  for (const el of root.querySelectorAll("button,summary,a")) {
    if (el.matches(".apply-cell,.icon-control") || el.querySelector(":scope > .control-label")) continue;
    const text = document.createElement("span");
    text.className = "control-label";
    text.append(...el.childNodes);
    el.append(text);
    el.classList.add("text-control");
  }
}
let template;
export function controlMarkup(html) {
  template ??= document.createElement("template");
  template.innerHTML = html;
  prepareControls(template.content);
  return template.innerHTML;
}
