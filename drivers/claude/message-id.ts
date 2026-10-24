import { createHash, type UUID } from 'node:crypto';

/** Keep UUID command IDs verbatim; core also uses SHA-256 IDs.
 * Their fallback must also be reproducible after restart, without another store.
 * UUIDv8 reserves 122 bits of a domain-separated SHA-256 hash for that purpose.
 * Keep this encoding stable: native transcripts persist these IDs.
 */
export function nativeMessageId(commandId: string): UUID {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commandId)) return commandId as UUID;
  const bytes = createHash('sha256').update('engine.claude.message\0').update(commandId).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
