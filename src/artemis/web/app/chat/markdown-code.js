const f=/^ {0,3}(`{3,}|~{3,})/,s=/(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g;export function proseOf(c){let t="";return String(c??"").split(`
`).map(e=>{const n=e.match(f)?.[1],r=n?e.slice(e.indexOf(n)+n.length):"";return t?(n&&n[0]===t[0]&&n.length>=t.length&&!r.trim()&&(t=""),""):n&&!(n[0]==="`"&&r.includes("`"))?(t=n,""):e}).join(`
`).replace(s,e=>e.replace(/[^\n]/g," "))}
