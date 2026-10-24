import type { SqlDb } from '../types.ts';
/** Stage 3 implements creation-time identity and taskkill /T /F. No unverified takeover on Windows. */
export function createWindowsCustody(_db:SqlDb): never { throw new Error('Windows process custody is unavailable until Stage 3'); }
