// Cursor (DSR 6n) and colour (OSC 10/11 `?`) queries are answered here, at the query's place in the output, and
// the browser's own answers to them are dropped: over a slow link those arrive after the program has quit and the
// shell echoes them as typed text (user, 10/22: `^[]11;rgb:2020/2020/2020^[\^[[2;1R` after `gh auth refresh`).
// Colours are the client's: the last report its browser sent, Console's dark terminal until then.
const OWED_MS = 10_000;
const OWED_MAX = 64;
const REPORT = /\x1b\](1[01]);(rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4})(?:\x07|\x1b\\)|\x1b\[(\d+);(\d+)R/g;
type Kind = '10' | '11' | 'cpr';
export class Replies {
  readonly colors: Record<'10' | '11', string> = { '10': 'rgb:e6e6/eeee/e9e9', '11': 'rgb:2020/2020/2020' };
  private owed: { kind: Kind; at: number }[] = [];
  private reply: (data: string) => void;
  private now: () => number;
  constructor(reply: (data: string) => void, now: () => number = Date.now) { this.reply = reply; this.now = now; }
  /** The headless screen's own answers: only its cursor reports go to the program (the browser still answers the rest). */
  answered(data: string): void { if (/^\x1b\[\d+;\d+R$/.test(data)) this.answer('cpr', data); }
  /** OSC 10/11 queries are answered here; a colour set (not `?`) stays the screen's. */
  color(ident: 10 | 11, data: string): boolean {
    const asks = data.split(';'); if (!asks.every(a => a === '?')) return false;
    asks.forEach((_, i) => { const k = String(ident + i); if (k === '10' || k === '11') this.answer(k, `\x1b]${k};${this.colors[k]}\x1b\\`); });
    return true;
  }
  /** Client input minus the browser's answers to queries already answered here. */
  input(data: string): string {
    const now = this.now(); this.owed = this.owed.filter(o => now - o.at < OWED_MS);
    return data.replace(REPORT, (match, ident: string | undefined, rgb: string | undefined, row: string | undefined, col: string | undefined) => {
      if (ident) this.colors[ident as '10' | '11'] = rgb!;
      const kind: Kind = (ident as Kind | undefined) ?? 'cpr';
      const owed = this.owed.findIndex(o => o.kind === kind);
      if (owed >= 0) { this.owed.splice(owed, 1); return ''; }
      // Not owed: a colour report, or a cursor report off row 1, is a stale duplicate (a resumed attach replays old
      // queries); `ESC[1;<2-16>R` is also a modified F3 key, so that one goes through.
      return kind === 'cpr' && row === '1' && Number(col) >= 2 && Number(col) <= 16 ? match : '';
    });
  }
  private answer(kind: Kind, data: string): void {
    this.owed.push({ kind, at: this.now() }); if (this.owed.length > OWED_MAX) this.owed.shift();
    this.reply(data);
  }
}
