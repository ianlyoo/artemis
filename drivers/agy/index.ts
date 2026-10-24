import { Codes, EngineError } from '../../core/types.ts';
import type { Driver } from '../../core/types.ts';
export function createAgyDriver(): Driver {
  return {
    disabled: 'agy disabled until its own verdict',
    provider: 'agy', caps: { steer: false, interrupt: false, rewind: 'none', compact: false, gate: 'none', images: false },
    async selfTest() { return { ok: false, reason: 'agy disabled until its own verdict' }; },
    async start() { throw new EngineError(Codes.DRIVER_DISABLED, 503, 'agy disabled until its own verdict'); },
  };
}
