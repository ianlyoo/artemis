import{parseCompany as h,heading as f}from"./company-message.js";import{leadKo as c,user as x,isLead as p,ledgerName as a,isLedger as d,l10n as s}from"../names.js";import{zoned as y}from"../zone.js";const $=/^> (?:답장|Reply) · ([^\r\n]+?) · (\d{1,2}\/\d{1,2} \d{2}:\d{2})\n/,u=/^> (?:인용|Quote) · (?:결정|할 일|질문|목표|Decision|Step|Question|Goal) #\d+[^\n]*\n(?:>[^\n]*(?:\n|$))*/;export const REPLY_GLYPH="M9 5 3 11l6 6 M3 11h10a7 7 0 0 1 7 7",SWIPE_THRESHOLD=48,replySwipe=(e,t)=>e>=SWIPE_THRESHOLD&&Math.abs(t)<24&&e>Math.abs(t)*1.5;const w=y("en-US",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});export function replyTime(e){if(!e)return null;const t=new Date(e);if(!Number.isFinite(t.getTime()))return null;const n=Object.fromEntries(w.formatToParts(t).map(r=>[r.type,r.value]));return`${n.month}/${n.day} ${n.hour}:${n.minute}`}export function replySender(e,t){if(e.role==="assistant"||e.role==="activity")return!t||p(t.role)?c():t.displayName||t.role||s("에이전트","Agent");const n=h(e.text);if(n)return f(n).who||a();const r=e.source??"owner";return r==="owner"?x():p(r)?c():d(r)?a():{cto:"CTO",pm:"PM",worker:s("작업자","Worker"),system:s("시스템","System")}[r]??r}export const replyText=e=>String(e.text||e.segments?.filter(t=>t.type==="md").map(t=>t.text).join(`
`)||(e.images?.length?s(`사진 ${e.images.length}장`,`${e.images.length} photo${e.images.length>1?"s":""}`):e.attachments?.map(t=>t.name).join(`
`)||"")).replace(/\r\n?/g,`
`);export function makeReply(e,t,n=null){const r=replyTime(e.at),o=replySender(e,t).replace(/[\r\n]+/g," "),l=n===null?(parseReply(replyText(e))?.body??replyText(e)).split(`
`).filter(i=>i.trim()).slice(0,3).join(`
`):String(n).replace(/\r\n?/g,`
`).trim();return r&&l.trim()?{who:o,time:r,text:l}:null}export function replyBlock(e){return`> ${s("답장","Reply")} · ${e.who} · ${e.time}
${e.text.split(`
`).map(t=>"> "+t).join(`
`)}`}export function parseReply(e){const t=String(e??"").replace(/\r\n?/g,`
`),n=$.exec(t);if(!n)return null;const r=t.slice(n[0].length),o=r.split(`
`),l=[];let i=0;for(;i<o.length&&/^>(?: |$)/.test(o[i]);)l.push(o[i++].replace(/^> ?/,""));return!l.length||!l.some(g=>g.trim())||i<o.length&&o[i].trim()?null:{who:n[1],time:n[2],text:l.join(`
`),body:o.slice(i).join(`
`).replace(/^\n+/,"")}}export function withoutQuote(e){const t=String(e??""),n=parseReply(t);return n?n.body:u.test(t)?t.replace(u,"").replace(/^\n+/,""):t}export const withReply=(e,t="")=>e?replyBlock(e)+(String(t).trim()?`

`+withoutQuote(t):""):String(t);const m=e=>String(e).replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/^\s*(?:[-*+]|\d+\.)\s+/gm,"").replace(/\[\^\w+\]/g,"").replace(/[*_`#]/g,"").replace(/\s+/g," ").trim();export function findReply(e,t,n){const r=m(t.text);return r?e.find(o=>replySender(o,n)===t.who&&replyTime(o.at)===t.time&&[replyText(o),replyText(o).replace(/\[\^(\w+)\]/g,"$1")].some(l=>m(l).includes(r)))??null:null}export const replyPreview=e=>e.text.split(`
`).find(t=>t.trim())??"";
