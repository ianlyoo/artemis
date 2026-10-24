import type { Frame, TimelineItem } from '../types.ts';

/** Loopback hook projection only; never return text, identity, origins or raw journal frames. */
export function userChannel(frames: Frame[]): { channel: 'console' | 'app' | null; userTurn: boolean } {
  const messages = frames.filter(frame => !frame.stale && frame.type === 'timeline' && (frame.item as TimelineItem)?.type === 'user_message').slice(-20).reverse();
  const user = (frame: Frame) => {
    const item = frame.item as Extract<TimelineItem, { type: 'user_message' }>;
    return frame.origin?.principal === 'user' && !['wake', 'system', 'agent', 'import'].includes(frame.origin.channel)
      && !!item.text.trim() && !/^\s*(?:⟦system:|[[<]|\/[a-z][\w:.-]*(?:\s|$))/i.test(item.text)
      && ![item.messageId, item.clientMessageId].some(id => /^(?:wake:|system-wake-)/.test(id ?? ''))
      && !/^console-[0-9a-f-]{36}-now$/.test(item.clientMessageId ?? '');
  };
  const last = messages.find(user);
  return { channel: last ? last.origin!.channel === 'console' ? 'console' : 'app' : null, userTurn: !!messages[0] && user(messages[0]) };
}
