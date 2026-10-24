import xterm from '@xterm/headless';
import type { IBufferCell } from '@xterm/headless';
import { TERMINAL_LIMITS } from '../core/types.ts';
import { Replies } from './replies.ts';
const { Terminal } = xterm;
function sgr(cell: IBufferCell): string {
  const codes = [0];
  for (const [on, code] of [[cell.isBold(),1],[cell.isDim(),2],[cell.isItalic(),3],[cell.isUnderline(),4],[cell.isBlink(),5],[cell.isInverse(),7],[cell.isInvisible(),8],[cell.isStrikethrough(),9]]) if (on) codes.push(code);
  for (const bg of [false, true]) {
    const value = bg ? cell.getBgColor() : cell.getFgColor();
    if (bg ? cell.isBgRGB() : cell.isFgRGB()) codes.push(bg ? 48 : 38, 2, (value >> 16) & 255, (value >> 8) & 255, value & 255);
    else if (bg ? cell.isBgPalette() : cell.isFgPalette()) codes.push(bg ? 48 : 38, 5, value);
  }
  return `\x1b[${codes.join(';')}m`;
}
export class Screen {
  private term: InstanceType<typeof Terminal>;
  private pending: Promise<void> = Promise.resolve();
  private replies: Replies;
  /** `reply` gets the answers to the program's cursor and colour queries (replies.ts). */
  constructor(cols: number, rows: number, reply: (data: string) => void = () => {}) {
    this.term = new Terminal({ cols, rows, scrollback: Math.max(0, TERMINAL_LIMITS.restoreLines - rows), allowProposedApi: true });
    this.replies = new Replies(reply);
    this.term.onData(data => this.replies.answered(data));
    for (const ident of [10, 11] as const) this.term.parser.registerOscHandler(ident, data => this.replies.color(ident, data));
  }
  /** Client input to pass to the program: the browser's duplicate query answers removed. */
  input(data: string): string { return this.replies.input(data); }
  write(data: string): Promise<void> { this.pending = this.pending.then(() => new Promise<void>(resolve => this.term.write(data, resolve))); return this.pending; }
  async resize(cols: number, rows: number): Promise<void> { await this.pending; this.term.resize(cols, rows); this.term.options.scrollback = Math.max(0, TERMINAL_LIMITS.restoreLines - rows); }
  async snapshot(lines = TERMINAL_LIMITS.restoreLines): Promise<{ text: string; ansi: string; cols: number; rows: number; cursorX: number; cursorY: number }> {
    await this.pending; const buffer = this.term.buffer.active; const text: string[] = []; const ansi: string[] = [];
    for (let y = Math.max(0, buffer.length - lines); y < buffer.length; y++) {
      const line = buffer.getLine(y)!; text.push(line.translateToString(true));
      let rendered = ''; let previous = '';
      const length = line.translateToString(true).length ? this.term.cols : 0;
      for (let x = 0; x < length; x++) {
        const cell = line.getCell(x)!; if (cell.getWidth() === 0) continue;
        const style = sgr(cell); if (style !== previous) { rendered += style; previous = style; }
        rendered += cell.getChars() || ' ';
      }
      ansi.push(rendered.trimEnd());
    }
    return { text: text.join('\n'), ansi: `\x1b[0m\x1b[2J\x1b[H${ansi.join('\r\n')}\x1b[0m\x1b[${buffer.cursorY + 1};${buffer.cursorX + 1}H`, cols: this.term.cols, rows: this.term.rows, cursorX: buffer.cursorX, cursorY: buffer.cursorY };
  }
  async prompt(): Promise<{ line: string; bracketedPaste: boolean }> {
    await this.pending; const buffer = this.term.buffer.active;
    return { line: buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? '', bracketedPaste: this.term.modes.bracketedPasteMode };
  }
  dispose(): void { this.term.dispose(); }
}
