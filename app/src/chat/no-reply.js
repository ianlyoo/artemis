import { proseOf } from "./markdown-code.js";
import { userKo, lang } from "../names.js";
export const NO_OWNER_UPDATE = "[company:no-owner-update]";
const HEAD = NO_OWNER_UPDATE.slice(0, -1);
const MARKER = /^\[company:no-owner-update(?::([^\r\n]*))?\]/;
export function ownerUpdate(text) {
  if (!text.includes("[")) return { text, memo: null };
  const lines = text.split("\n"), prose = proseOf(text).split("\n");
  const last = lines.findLastIndex((line) => line.trim());
  const kept = [];
  let memo = null, cutTail = false;
  for (const [index, line] of lines.entries()) {
    const said = line.trim();
    if (said.startsWith("[") && prose[index].trimStart().startsWith("[")) {
      const marker = said.match(MARKER);
      if (marker?.[0] === said) {
        memo ??= marker[1]?.replace(/\s+/g, " ").trim() || null;
        cutTail ||= index === last;
        continue;
      }
      if (index === last && (HEAD.startsWith(said) || said.startsWith(HEAD + ":"))) {
        cutTail = true;
        continue;
      }
      if (index === 0 && marker) {
        kept.push(line.trimStart().slice(marker[0].length).trimStart());
        continue;
      }
    }
    kept.push(line);
  }
  const reply = kept.join("\n");
  return { text: cutTail ? reply.trimEnd() : reply, memo: reply.trim() ? null : memo };
}
export const spoken = (text) => ownerUpdate(text).text;
export const silent = (text) => !spoken(text).trim();
const EN = ["ok(?:ay)?", "ack(?:nowledged)?", "noted", "got it", "done", "(?:just )?confirmed", "checked", "no reply(?: needed)?", "no response(?: needed)?", "(?:nothing|no) (?:new|news|updates?|changes?)(?: to (?:report|add|say|send|share|tell))?", "nothing to (?:report|add|say|send|share|tell)", "nothing (?:new )?for (?:the )?owner", "no_?reply", "heartbeat_?ok", "standing by"];
const KO = () => ["확인(?:했어요|했습니다|함|완료| 완료)?", "알겠(?:어요|습니다)", "(?:전할|전달할|드릴|보고할|답할) ?(?:것|내용|말씀|소식)(?:이)? ?(?:하나도 )?없(?:음|어요|습니다)", "(?:새로운|새) ?(?:소식|내용|것|일|변동)(?:이)? ?없(?:음|어요|습니다)", "변동 ?(?:사항)?(?:이)? ?없(?:음|어요|습니다)", "특이 ?사항(?:이)? ?없(?:음|어요|습니다)", "(?:" + userKo().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "께 )?(?:전할|드릴) ?(?:것|말씀)(?:이)? ?없(?:음|어요|습니다)", "없음", "없어요", "응답 ?(?:불필요|필요 ?없(?:음|어요|습니다))", "대기 ?중(?:이에요|입니다)?"];
let phrase = null, phraseFor = null;
const PHRASE = () => phraseFor === userKo() ? phrase : (phraseFor = userKo(), phrase = new RegExp("^(?:" + [...EN, ...KO()].join("|") + ")$", "iu"));
const CLAUSE = /[.!?。…·—–,;:\n]+|\s-\s/u;
export function isNoReply(text) {
  const said = String(text ?? "").trim();
  if (!said) return true;
  if (said.length > 80) return false;
  const clauses = said.split(CLAUSE).map((clause) => clause.replace(/["'`*_~()[\]]+/gu, "").replace(/\s+/gu, " ").trim()).filter(Boolean);
  const phrase2 = PHRASE();
  return clauses.length > 0 && clauses.every((clause) => phrase2.test(clause));
}
export function isInternal(text) {
  const said = String(text ?? "");
  if (said.includes("```") || lang() === "en") return false;
  const words = said.split(/\s+/u).filter((word) => /\p{L}/u.test(word)), hangul = words.filter((word) => /\p{Script=Hangul}/u.test(word)).length;
  return words.length >= 3 && hangul * 10 < words.length;
}
