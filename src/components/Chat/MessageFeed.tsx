import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { markRead, subscribeMessages, tsMillis } from '../../lib/chat/chatService';
import { dayLabel } from '../../lib/chat/text';
import type { ChatMessage } from '../../lib/chat/types';
import { MessageItem } from './MessageItem';

const PAGE = 50;
const GROUP_MS = 5 * 60 * 1000;

interface Props {
  channelId: string;
  myUid: string;
  canModerate?: boolean;
  highlightId?: string | null;
  emptyHint?: React.ReactNode;
}

export function MessageFeed({ channelId, myUid, canModerate, highlightId, emptyHint }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pageSize, setPageSize] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);

  useEffect(() => {
    setMessages([]);
    setPageSize(PAGE);
    setLoading(true);
    stickToBottom.current = true;
  }, [channelId]);

  useEffect(() => {
    const unsub = subscribeMessages(channelId, pageSize, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsub();
  }, [channelId, pageSize]);

  // Mark as read whenever new messages arrive while the channel is open.
  useEffect(() => {
    if (!myUid || messages.length === 0) return;
    if (document.visibilityState === 'visible') markRead(myUid, channelId).catch(() => {});
  }, [messages, myUid, channelId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && myUid) markRead(myUid, channelId).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [myUid, channelId]);

  // Keep scrolled to the newest message, or hold position after loading older ones.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (highlightId && document.getElementById(`msg-${highlightId}`)) return;
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    } else if (prevHeight.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current + el.scrollTop;
      prevHeight.current = 0;
    }
  }, [messages, highlightId]);

  // Jump to a linked message (?m=...)
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`msg-${highlightId}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      stickToBottom.current = false;
    } else if (!loading && messages.length >= pageSize && pageSize < 1000) {
      setPageSize((p) => p + PAGE * 2); // older than what's loaded — fetch more
    }
  }, [highlightId, messages, loading, pageSize]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && messages.length >= pageSize && !loading) {
      prevHeight.current = el.scrollHeight;
      setPageSize((p) => p + PAGE);
    }
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain pb-2">
      {messages.length >= pageSize && (
        <div className="text-center text-xs text-brand-secondary py-3">Scroll up for older messages</div>
      )}
      {!loading && messages.length === 0 && (
        <div className="h-full flex items-center justify-center p-8 text-center text-sm text-brand-secondary">
          {emptyHint || 'No messages yet. Say hello 👋'}
        </div>
      )}
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const t = tsMillis(m.createdAt) || Date.now();
        const pt = prev ? tsMillis(prev.createdAt) || Date.now() : 0;
        const newDay = !prev || new Date(t).toDateString() !== new Date(pt).toDateString();
        const compact =
          !newDay && !!prev && prev.authorId === m.authorId && !prev.deleted && !m.system && !prev.system && t - pt < GROUP_MS;
        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="flex items-center gap-3 px-4 pt-4 pb-1">
                <div className="h-px flex-1 bg-brand-border" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-secondary">{dayLabel(t)}</span>
                <div className="h-px flex-1 bg-brand-border" />
              </div>
            )}
            <MessageItem
              message={m}
              myUid={myUid}
              compact={compact}
              highlighted={m.id === highlightId}
              canModerate={canModerate}
              onOpenImage={setLightbox}
            />
          </Fragment>
        );
      })}

      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Close">
            <X size={28} />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain rounded" onClick={(e) => e.stopPropagation()} />
          <a
            href={lightbox}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 px-4 py-2 rounded-full bg-white text-sm font-medium"
          >
            Open full size
          </a>
        </div>
      )}
    </div>
  );
}
