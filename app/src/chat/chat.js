import { renderBlock, blockEnv } from "../boards/boards.js";
import { answerFor } from "../boards/answer.js";
import { boardCards } from "../boards/cards.js";
import { prose } from "../boards/rich-text.js";
import { el, problem } from "../boards/dom.js";
import { feed } from "./feed.js";
import { createSegments } from "./segments.js";
import { chatBlocks, pendingVisual, control } from "./visuals.js";
import { textWriter, follower } from "./motion.js";
import { createThread } from "./thread.js";
import { createProviderPermissionCards } from "./provider-permissions.js";
import { createComposer } from "./composer.js";
import { createQueue } from "./queue.js";
import { createPane } from "./pane.js";
import { createPeek } from "./peek.js";
import { openViewer } from "../image-viewer.js";
import { autoOpen, classifyLink, targetKey } from "./links.js";
import { stateLine, linkDown, fallbackLine } from "./view.js";
import { QUIET_MS } from "../quiet.js";
import { loadStyles, turnLine } from "./entry.js";
import { agentName, LEAD_KEY } from "./agents.js";
import { QUOTE_EVENT, REVEAL_EVENT } from "./quote.js";
import { createTurnList, clearSheet } from "./turn-list.js";
import { createDeskMenu } from "../desk-menu.js";
import { createAideMenu } from "../aide-menu.js";
import { lazyApprovalCards } from "./lazy-cards.js";
import { onAnchor, peekAnchor, takeAnchor } from "../routing.js";
import { seekAnchor, missedLine } from "./anchor.js";
import { ownerFrame } from "../owner-steps.js";
import { itemState } from "../item-route.js";
import { createQuestions, threadQuestions } from "./questions.js";
import { lead, isLead } from "../names.js";
const STATE_ROOM = 26, END_ROOM = 22;
const MISSED_MS = 8e3;
export async function mountChat(container, options = {}) {
  await loadStyles();
  return options.agentTitle ? (await import("./company.js")).mountCompanyChat(container, options) : mountThread(container, options);
}
export async function mountThread(container, { layout = "pc", head = () => {
}, makePane = createPane, agentEntry = null, active = () => true } = {}) {
  const phone = layout === "phone", origin = location.origin;
  let early = import("./approval-card.js").then((cards2) => {
    void cards2.styled();
    return cards2;
  });
  early.catch(() => {
  });
  await loadStyles();
  const { api } = await import("/client.js");
  const store = agentEntry?.store ?? feed.store, life = new AbortController(), signal = life.signal;
  store.resetLedger();
  const identity = agentEntry?.agent, name = () => agentEntry ? agentName(agentEntry.agent) : lead();
  const root = el("div", { class: "chat " + (phone ? "chat-phone" : "chat-pc") });
  const scroller = el("div", { class: "chat-scroll", tabindex: "-1", role: "region", "aria-label": "Conversation with " + name() });
  const jump = control("↓ Latest", { class: "chat-jump", hidden: true, title: "Go to where new replies appear" });
  const status = el(phone ? "span" : "p", { class: phone ? "chat-state" : "room-state", role: "status" });
  let atEnd = true;
  let downSince = 0, told = false, quiet = 0;
  let missed = null, missedTimer = 0;
  const pin = follower(scroller, jump, { onChange: (pinned) => {
    if (phone && pinned !== atEnd) {
      atEnd = pinned;
      paintState();
    }
  } });
  let pane = null, lastTop = 0, lastPinned = true, shown = false, everShown = false;
  const peek = createPeek({ host: root, scroller, phone });
  const prefill = (text) => dispatchEvent(new CustomEvent("lead:prefill", { detail: { text } }));
  const questions = !identity || isLead(identity.role) ? createQuestions({ api, items: () => store.items }) : threadQuestions({ items: () => store.items, answer: (text, key) => composer.answer(text, key), api });
  let lastEvent = feed.dashboard?.dashboard?.last_event_id;
  void questions?.load();
  const segments = createSegments({ api, prose, blockEnv, origin, phone, pending: pendingVisual, renderBlock: chatBlocks({ renderBlock, prose, prefill, openBlock: phone ? null : (block) => pane.open({ kind: "block", block }, { from: "block" }) }), open: (target, how) => pane.open(target, how), card: (id, node, owner) => {
    approvalCards.attach(node, "#/approvals/" + id, null, { placed: true });
    owner.own(() => approvalCards.detach(node));
  }, choices: { questions, subscribe: (fn) => store.subscribe(fn) }, secrets: !agentEntry || agentEntry.key === LEAD_KEY, sign: { agentId: !agentEntry || agentEntry.key === LEAD_KEY ? null : agentEntry.agent.id }, text: (draw) => textWriter(draw, { onPaint: () => pin.follow() }) });
  let composer = null;
  const approvalCards = lazyApprovalCards({ api, origin, scroller, follow: pin, open: (target, how) => pane.open(target, how), items: () => store.items, reveal: (key, find) => thread?.reveal({ key, find }) ?? false }, () => {
    const got = early ?? import("./approval-card.js");
    early = null;
    return got;
  });
  approvalCards.frame(feed.dashboard?.dashboard);
  await approvalCards.ready();
  const cards = approvalCards;
  const thread = createThread({ cards, store, identity, name, mountSegments: segments, scroller, follow: pin, signal, homeApi: api, onReply: (reply) => composer.reply(reply), onRestore: (draft, why) => composer.restore(draft, why), onChange: () => changed(), onImage: (images, index, img) => pane.open({ kind: "image", images, index, from: img?.closest?.(".msg-lead") ? `From ${name()}'s reply` : img?.closest?.(".msg-tools") ? "Viewed by " + name() : "Sent by you" }, { from: "image" }), peek, phone, openRef: (target) => pane.open(target, { from: "chip" }), opens: (target) => pane?.accepts?.(target) ?? true });
  const unhear = feed.onDashboard?.((payload) => {
    segments.refresh?.();
    cards.frame(payload?.dashboard);
    const event = payload?.dashboard?.last_event_id;
    if (event !== lastEvent) {
      lastEvent = event;
      void questions?.load();
    }
  }) ?? (() => {
  });
  const blocked = () => agentEntry?.agent.state === "ended" ? "This agent has ended" : stateLine(store);
  const quoted = () => {
    if (isLead(identity?.role) && !active()) void feed.agents?.select?.(feed.agents.lead?.key);
  };
  addEventListener(QUOTE_EVENT, quoted);
  const revealed = (event) => {
    const detail = event.detail;
    if (detail?.taken || identity && !isLead(identity.role) || !shown || !active()) return;
    if (thread.reveal({ key: detail.key, center: true })) detail.taken = true;
  };
  addEventListener(REVEAL_EVENT, revealed);
  let seeking = false;
  const transcript = () => store.items.length ? Promise.resolve() : new Promise((done) => {
    let off = () => {
    };
    const end = () => {
      off();
      clearTimeout(late);
      done();
    }, late = setTimeout(end, 8e3);
    off = store.subscribe((event) => {
      if (event.type === "snapshot") end();
    });
  });
  async function anchored() {
    if (identity && !isLead(identity.role) || seeking || !peekAnchor() || peekAnchor().kind === "meeting") return;
    if (!active()) {
      void feed.agents?.select?.(feed.agents.lead?.key);
      return;
    }
    if (!shown) return;
    const anchor = takeAnchor();
    seeking = true;
    miss(false);
    let found = false;
    try {
      found = await seekAnchor(anchor, { store, root: scroller, questions, ready: transcript, reveal: (key, find) => thread.reveal({ key, find, center: true }), away: (to) => {
        if (signal.aborted) return false;
        location.hash = to;
      }, frame: ownerFrame, state: (place) => itemState(place, api) });
    } catch {
    } finally {
      seeking = false;
    }
    if (found !== true && !signal.aborted) {
      pin.jump();
      miss(typeof found === "string" ? found : missedLine());
    }
  }
  function miss(on) {
    clearTimeout(missedTimer);
    missed = on || null;
    paintState();
    if (on) {
      status.classList.remove("is-told");
      void status.offsetWidth;
      status.classList.add("is-told");
      missedTimer = setTimeout(() => miss(false), MISSED_MS);
    }
  }
  const unanchor = onAnchor(() => void anchored());
  composer = createComposer({ store, phone, peek, identity, name, active, ...agentEntry ? { upload: agentEntry.upload, draftKey: isLead(identity.role) ? "chat-draft" : "chat-draft:" + agentEntry.key } : {}, canSend: blocked, onBlocked: () => {
    told = true;
    paintState();
    status.classList.remove("is-told");
    void status.offsetWidth;
    status.classList.add("is-told");
  }, onSent: () => pin.jump(), onView: (images, index, img) => makePane === createPane ? openViewer(images, index, { from: img }) : pane.open({ kind: "image", images, index, from: "Not sent yet" }, { from: "image" }) });
  const queue = createQueue({ store, phone, onRestore: (draft, why) => composer.restore(draft, why) });
  const permissions = createProviderPermissionCards({ api, store, onChange: (node) => {
    scroller.classList.toggle("has-permissions", !node.hidden);
    pin.follow();
  } });
  scroller.append(thread.node, permissions.node);
  const grown = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => entries.forEach((entry) => entry.target === scroller ? pin.resized() : pin.follow())) : null;
  grown?.observe(thread.node);
  grown?.observe(permissions.node);
  grown?.observe(scroller);
  const turns = phone || !agentEntry ? createTurnList({ api, phone, open: (target, how) => pane.open(target, how) }) : null;
  const desk = turns && !phone ? createDeskMenu() : null;
  const aides = turns ? createAideMenu({ phone }) : null;
  let dock, docked = null, unsheet = null, main = null;
  if (phone) {
    dock = el("div", { class: "chat-dock" }, jump, status, queue.node, composer.node);
    root.append(scroller, dock);
    const box = composer.node.querySelector(".composer-box");
    let clear = -1;
    const fit = () => {
      const reply = composer.node.querySelector(".composer-reply");
      const top = queue.node.hidden ? reply && !reply.hidden ? reply : box : queue.node;
      const below = dock.getBoundingClientRect().bottom - top.getBoundingClientRect().top;
      const state = status.isConnected && status.offsetHeight ? top.getBoundingClientRect().top - status.getBoundingClientRect().top : 0;
      const next = Math.ceil(below + Math.max(state - END_ROOM, STATE_ROOM));
      if (next !== clear) {
        clear = next;
        root.style.setProperty("--dock-h", next + "px");
        pin.resized();
      }
    };
    docked = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    docked?.observe(dock);
    docked?.observe(box);
    unsheet = clearSheet(turns.panel, root, root, () => pin.resized());
  } else {
    dock = el("div", { class: "room-dock" }, jump, status, queue.node, composer.node);
    const head2 = turns ? el("div", { class: "room-head" }, aides.button, aides.panel, desk.button, desk.panel, turns.button, turns.panel) : null;
    main = el("div", { class: "room-main" }, ...head2 ? [head2] : [], scroller, dock);
    if (head2) {
      main.classList.add("has-head");
      unsheet = clearSheet(turns.panel, { getBoundingClientRect: () => ({ top: head2.getBoundingClientRect().bottom }) }, root, () => pin.resized());
    }
    root.append(main);
  }
  const flip = () => {
    const nodes = [thread.node, dock], before = nodes.map((node) => node.getBoundingClientRect().left), restore = thread.hold();
    return () => {
      restore();
      nodes.forEach((node, n) => {
        const dx = before[n] - node.getBoundingClientRect().left;
        if (Math.abs(dx) > 1) node.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    };
  };
  const paneBlocks = chatBlocks({ renderBlock, prose, prefill, mode: "pane" });
  const paneCards = boardCards({ api });
  const boardEnv = (env) => ["board", "file"].includes(pane.current?.kind) ? { ...env, cards: paneCards } : env;
  pane = makePane({ host: root, api, origin, phone, render: (block, node, owner, env) => paneBlocks(block, node, owner, ["answer", "sign"].includes(block?.type) && pane.current?.kind === "board" ? { ...env, answer: answerFor(pane.current) } : boardEnv(env)), flip: phone ? () => null : flip, onChange: () => {
    marks();
    pin.follow();
  } });
  if (main) composer.dropOn(main);
  container.replaceChildren(root);
  function marks() {
    const now = pane.current ? targetKey(pane.current) : null;
    for (const chip of root.querySelectorAll(".chat-open")) {
      const target = classifyLink(chip.getAttribute("href"), origin);
      chip.classList.toggle("is-shown", !!now && target.kind !== "other" && targetKey(target) === now);
    }
  }
  const changed = () => marks();
  scroller.addEventListener("scroll", () => {
    if (shown) lastTop = scroller.scrollTop;
  }, { passive: true });
  function paintState() {
    let line = blocked();
    const turn = store.turn;
    clearTimeout(quiet);
    if (!line || !linkDown(store) || agentEntry?.agent.state === "ended") downSince = 0, told = false;
    else {
      downSince ||= Date.now();
      const wait = downSince + QUIET_MS - Date.now();
      if (wait > 0 && !told) {
        line = null;
        quiet = setTimeout(paintState, wait);
      }
    }
    const running = phone && !line && turn.running && !atEnd;
    const fallback = !line && !running ? fallbackLine(store) : null;
    status.textContent = running ? turnLine(turn, name()) : missed ?? line ?? fallback ?? "";
    status.classList.toggle("is-running", running);
    status.classList.toggle("is-fallback", !!fallback);
    status.classList.toggle("is-problem", !missed && !!line && store.state.state !== "connecting");
  }
  const auto = phone ? null : autoOpen((target, how) => {
    if (active()) pane.open(target, how);
  });
  auto?.({ type: "snapshot", items: store.items });
  const unsubscribe = store.subscribe((event) => {
    thread.handle(event);
    auto?.(event);
    if (event.type === "state") scroller.setAttribute("aria-label", "Conversation with " + name());
    if (["state", "turn", "connection", "snapshot", "reset"].includes(event.type)) {
      paintState();
      composer.refresh();
    }
    if (event.type === "snapshot" || event.type === "turn" && !event.turn?.running) void questions?.load();
  });
  paintState();
  const visible = () => active() && root.isConnected && root.getClientRects().length > 0 && getComputedStyle(root).visibility === "visible";
  function check() {
    const now = visible();
    if (now === shown) return;
    shown = now;
    thread.pause(!now);
    if (!now) {
      lastPinned = pin.pinned;
      return;
    }
    const first = !everShown;
    everShown = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!active()) return;
      if (pin.pinned && (first || lastPinned)) pin.jump();
      else {
        pin.release();
        scroller.scrollTop = lastTop;
      }
      void anchored();
    }));
  }
  thread.pause(true);
  const seen = typeof IntersectionObserver === "function" ? new IntersectionObserver(check) : null;
  seen?.observe(root);
  const panel = container.closest("[data-panel]");
  const toggled = panel && typeof MutationObserver === "function" ? new MutationObserver(check) : null;
  toggled?.observe(panel, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
  check();
  if (!phone) pane.restore();
  const typed = (event) => {
    if (phone || !active() || !shown || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key.length !== 1 || event.key === " ") return;
    if (!root.contains(event.target) && event.target !== document.body) return;
    if (event.target.closest?.("input,textarea,select,button,a,summary,[contenteditable]")) return;
    composer.focus();
  };
  document.addEventListener("keydown", typed);
  if (phone) head(el("div", { class: "chat chat-head" }, aides.button, aides.panel, turns.button, turns.panel));
  function unmount() {
    life.abort();
    unsubscribe();
    unhear();
    clearTimeout(quiet);
    clearTimeout(missedTimer);
    removeEventListener(QUOTE_EVENT, quoted);
    removeEventListener(REVEAL_EVENT, revealed);
    unanchor();
    document.removeEventListener("keydown", typed);
    seen?.disconnect();
    toggled?.disconnect();
    grown?.disconnect();
    docked?.disconnect();
    unsheet?.();
    thread.destroy();
    cards.destroy();
    paneCards.destroy();
    permissions.destroy();
    turns?.destroy();
    desk?.destroy();
    aides?.destroy();
    queue.destroy();
    composer.destroy();
    pane.destroy();
    pin.destroy();
    peek.destroy();
    root.remove();
    if (phone && active()) head(null);
    store.resetLedger();
  }
  unmount.focus = () => composer.focus();
  unmount.visibility = check;
  unmount.park = () => {
    lastTop = scroller.scrollTop;
    lastPinned = pin.pinned;
    shown = false;
    thread.pause(true);
    store.resetLedger();
  };
  return unmount;
}
export function mountProblem(container, error) {
  console.error("Home chat:", String(error?.message || error));
  container.replaceChildren(problem(`Couldn't load ${lead()} chat. Reload the page.`));
}
