import { useEffect, useMemo, useState } from 'react';
import { subscribeMyDMs, subscribeReads, subscribeSharedChannels, tsMillis } from './chatService';
import type { ChatChannel } from './types';

export interface ChannelsState {
  channels: ChatChannel[];   // team channels, alphabetical
  orderThreads: ChatChannel[]; // most recent activity first
  dms: ChatChannel[];        // most recent activity first
  reads: Record<string, number>;
  isUnread: (c: ChatChannel) => boolean;
  unreadCount: number;
}

/**
 * Live channel lists + unread state for the signed-in user.
 * Order threads only count as unread once you've opened them (or been in them),
 * so a busy shop doesn't light up every order.
 */
export function useChatChannels(uid: string | undefined): ChannelsState {
  const [shared, setShared] = useState<ChatChannel[]>([]);
  const [dms, setDms] = useState<ChatChannel[]>([]);
  const [reads, setReads] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!uid) return;
    const a = subscribeSharedChannels(setShared);
    const b = subscribeMyDMs(uid, setDms);
    const c = subscribeReads(uid, setReads);
    return () => {
      a();
      b();
      c();
    };
  }, [uid]);

  return useMemo(() => {
    const isUnread = (c: ChatChannel) => {
      const last = tsMillis(c.lastMessageAt);
      if (!last || c.lastMessageAuthorId === uid) return false;
      const read = reads[c.id];
      if (c.type === 'order' && read === undefined) return false;
      return last > (read || 0);
    };
    const byRecent = (a: ChatChannel, b: ChatChannel) => tsMillis(b.lastMessageAt) - tsMillis(a.lastMessageAt);
    const channels = shared.filter((c) => c.type === 'channel').sort((a, b) => a.name.localeCompare(b.name));
    const orderThreads = shared.filter((c) => c.type === 'order' && c.lastMessageAt).sort(byRecent);
    const sortedDms = [...dms].sort(byRecent);
    const unreadCount = [...channels, ...orderThreads, ...sortedDms].filter(isUnread).length;
    return { channels, orderThreads, dms: sortedDms, reads, isUnread, unreadCount };
  }, [shared, dms, reads, uid]);
}
