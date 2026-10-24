/** Single-consumer, lossless FIFO used for SDK input and normalized events. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private wake: (() => void) | undefined;
  private ended = false;
  push(value: T): void {
    if (this.ended) throw new Error('queue closed');
    this.items.push(value);
    this.wake?.();
  }
  end(): void { this.ended = true; this.wake?.(); }
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.items.length) { yield this.items.shift()!; continue; }
      if (this.ended) return;
      await new Promise<void>(resolve => { this.wake = resolve; });
      this.wake = undefined;
    }
  }
}
