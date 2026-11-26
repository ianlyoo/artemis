import { mountMermaid } from "../chat/rendering.js";
import { mountRich } from "../chat/rich/renderer.js";
import { createSegments } from "../chat/segments.js";
import { feed } from "../chat/feed.js";
import { el, assetPath, response, problem } from "./dom.js";
import { mountIsland } from "../islands/island.js";
import { saveDownload } from "../chat/file-download.js";
import { prose, htmlDocument, pageDocument } from "./rich-text.js";
import { goalLines } from "./goal-lines.js";
import { splitNotes } from "./notes.js";
import { answerSlot } from "./answer.js";
import { signSlot } from "./sign.js";
import { mountOpportunities } from "./opportunities.js";
import { chart, sketch, dataTable } from "./graphics.js";
import { sheet, pdf } from "./media.js";
import { secretField } from "./secret-field.js";
import { iconNode } from "./icons.js";
import { headingText } from "./reports.js";
import { questionCard } from "./cards.js";
import { has, l10n } from "../names.js";
export function blockEnv({ api, open, phone = false, icons = false }, owner) {
  const env = { api, signal: owner.signal, own: (fn) => owner.own(fn), open, phone, icons };
  env.image = async (image, source) => {
    const path = assetPath(source);
    if (!path) return;
    try {
      const result = await response(api, path, owner.signal), blob = await result.blob();
      if (owner.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      owner.own(() => URL.revokeObjectURL(url));
      image.src = url;
      image.addEventListener("error", () => {
        if (!owner.signal.aborted) image.replaceWith(problem("Couldn’t show this image"));
      }, { once: true });
    } catch (error) {
      if (!owner.signal.aborted) image.replaceWith(problem("Couldn’t load this image"));
    }
  };
  return env;
}
function copyControl(text, env) {
  const state = el("span", { class: "bv-copy-state", role: "status", "aria-live": "polite" });
  const copy = env?.icons ? el("button", { class: "bv-button bv-copy lib-ctl lib-ibtn", type: "button", "aria-label": "Copy code", title: "Copy code" }, el("span", { class: "lib-lbl" }, iconNode("copy", "lib-ico"))) : el("button", { class: "bv-button", type: "button" }, "Copy");
  const say = (word) => {
    if (env?.icons) state.textContent = word;
    else copy.textContent = word;
  };
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText((typeof text === "function" ? text() : text) || "");
      say("Copied");
    } catch {
      say("Select the text to copy");
    }
  });
  return env?.icons ? [state, copy] : [copy];
}
export function renderBlock(block, node, owner, env) {
  if (["table", "chart", "timeline", "diagram"].includes(block.type) && block.src !== void 0 && !block.as_of) {
    const segments = createSegments({ api: env.api, prose, renderBlock, blockEnv, origin: globalThis.location?.origin, open: env.open ?? (() => {
    }), phone: env.phone });
    const mounted = segments(node, owner.signal);
    mounted.update([{ type: "block", block }]);
    const unhear = feed.onDashboard(() => segments.refresh());
    owner.own(() => {
      unhear();
      mounted.destroy();
    });
    return;
  }
  const title = block.title && el("h3", { class: "bv-block-title" }, block.title);
  node.dataset.type = block.type;
  if (["accent", "muted"].includes(block.tone)) node.dataset.tone = block.tone;
  if (title && !["heading", "html"].includes(block.type)) node.append(title);
  if (block.type === "code" && block.lang === "opportunities") {
    void mountOpportunities(node, env);
    return;
  }
  if (block.type === "code" && block.lang === "choices") {
    node.dataset.type = "choices";
    if (!env.cards?.attach(block, node, owner, env)) questionCard(node, block, { phone: !!env.phone }, owner);
    return;
  }
  switch (block.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(block.level) || 2));
      const heading = el(level === 1 ? "h2" : level === 2 ? "h2" : "h3", { class: "bv-section-heading", "data-level": level }, headingText(block.text));
      node.append(heading);
      break;
    }
    case "text":
      node.append(goalLines(prose(block.text, env)));
      if (env.notes && !splitNotes(block.text).text.trim()) node.hidden = true;
      break;
    case "notes":
      node.append(el("ol", { class: "bv-fn" }, (block.items || []).map((item) => el("li", { value: item.n }, prose(item.text, env, true), " ", el("button", { type: "button", class: "bv-fn-back", "data-note": String(item.n), "aria-label": "Back to the text", title: "Back to the text" }, "↩")))));
      break;
    case "code": {
      if (block.lang === "mermaid") {
        let current = block;
        const host = el("div");
        node.append(host, el("div", { class: "cv-actions" }, ...copyControl(() => current.text, env)));
        const drawing = mountMermaid(host, { code: block.text }, (fn) => owner.own(fn));
        return { update: (next) => {
          current = next;
          drawing.update({ code: next.text });
        } };
      }
      if (block.lang === "cindy-ui") {
        const rich = mountRich(node, { source: block.text, stateKey: env.boardId && block.id ? JSON.stringify(["board", env.boardId, block.id]) : null, prose: (source) => prose(source, env) });
        owner.own(() => rich.destroy());
        return rich;
      }
      node.append(el("div", { class: "bv-code-head" }, el("span", { class: "bv-numeric" }, block.lang || "TEXT"), ...copyControl(block.text, env)), el("pre", { class: "bv-code", tabindex: "0" }, el("code", {}, block.text)));
      break;
    }
    case "timeline":
      node.append(el("ol", { class: "bv-timeline" }, (block.items || []).map((item) => el("li", {}, el("time", { class: "bv-numeric" }, item.when), el("div", {}, el("strong", {}, item.label), item.detail && prose(item.detail, env))))));
      break;
    case "table":
      node.append(dataTable(block.columns || [], block.rows || [], { format: (value) => prose(String(value ?? ""), env, true), numeric: (value) => /^[-+≈\d,.%\s]+$/.test(String(value)) }));
      break;
    case "chart":
      node.append(chart(block, { compact: env.phone }));
      break;
    case "sketch":
      node.append(sketch(block));
      break;
    case "image": {
      const image = el("img", { alt: block.alt || block.title || "", loading: "lazy", decoding: "async" }), figure = el("figure", { class: "bv-image" }, image, block.alt && el("figcaption", {}, block.alt));
      node.append(figure);
      env.image(image, block.src);
      break;
    }
    case "video": {
      const host = el("div", { class: "bv-video" }), src = assetPath(block.src), name = block.alt || block.title || "Video";
      node.append(host);
      const failed = () => {
        if (!owner.signal.aborted) host.replaceWith(problem("Couldn’t load this video"));
      };
      if (!src) {
        failed();
        break;
      }
      const asset = src.startsWith("/canvas/assets/");
      void (env.island ?? mountIsland)("video-player", host, { src: asset ? src + "/play" : src, poster: asset ? src + "/poster" : null, name, onError: failed, onDownload: env.api ? (progress) => saveDownload(env.api, src, /\.(mp4|webm|mov)$/i.test(name) ? name : name + src.slice(src.lastIndexOf(".")), void 0, progress).then(() => null, () => l10n("다운로드하지 못했어요", "Didn't download")) : null }).then((player) => {
        if (owner.signal.aborted) player.unmount();
        else owner.own(() => player.unmount());
      }, failed);
      break;
    }
    case "audio": {
      const host = el("div", { class: "bv-audio" }), src = assetPath(block.src);
      node.append(host);
      const failed = () => {
        if (!owner.signal.aborted) host.replaceWith(problem("Couldn’t load this sound"));
      };
      if (!src) {
        failed();
        break;
      }
      void (env.island ?? mountIsland)("audio-player", host, { src, name: block.alt || block.title || l10n("소리", "Audio"), onError: failed }).then((player) => {
        if (owner.signal.aborted) player.unmount();
        else owner.own(() => player.unmount());
      }, failed);
      break;
    }
    case "sheet":
      node.append(sheet(block, env));
      break;
    case "pdf":
      node.append(pdf(block, env));
      break;
    case "answer":
      return answerSlot(block, node, env) ?? void 0;
    case "sign":
      if (!has("sign")) {
        node.hidden = true;
        break;
      }
      return signSlot(block, node, env) ?? void 0;
    case "secret":
      secretField(block, node, env);
      break;
    case "step":
      if (!env.cards?.attach(block, node, owner)) node.append(el("p", {}, l10n("단계 #", "Step #") + block.step));
      break;
    case "card":
      node.append(el("p", { class: "bv-card-link" }, el("a", { href: "#/approvals/" + block.approval }, l10n("승인 #" + block.approval + " 질문 보기", "See approval #" + block.approval))));
      break;
    case "html":
      node.append(typeof block.page === "string" && block.page.startsWith("/canvas/page/") ? pageDocument(block, env) : htmlDocument(block.html, env));
      break;
    default:
      node.append(problem("Unsupported block"));
  }
}
