export const QUIET_READS = Object.freeze({ delays: [2e3, 5e3, 15e3, 3e4], window: 9e4 });
const restarting = (response) => response.status === 502 || response.status === 503;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
export function quietReads(api, { sleep = pause, now = Date.now } = {}) {
  return async (path, init = {}) => {
    if ((init.method ?? "GET").toUpperCase() !== "GET") return api(path, init);
    const { timeout, signal, ...rest } = init, started = now();
    for (let tries = 0; ; tries++) {
      const wait = QUIET_READS.delays[Math.min(tries, QUIET_READS.delays.length - 1)];
      const limits = [signal, timeout && AbortSignal.timeout(timeout)].filter(Boolean);
      let failed;
      try {
        const response = await api(path, { ...rest, ...limits.length ? { signal: AbortSignal.any(limits) } : {} });
        if (!restarting(response)) return response;
        failed = () => response;
      } catch (error) {
        if (signal?.aborted) throw error;
        failed = () => {
          throw error;
        };
      }
      if (now() - started + wait > QUIET_READS.window) return failed();
      await sleep(wait);
      if (signal?.aborted) throw signal.reason;
    }
  };
}
