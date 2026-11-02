import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Loader2, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { searchMessages, tsMillis } from '../../lib/chat/chatService';
import { formatTime } from '../../lib/chat/text';
import type { ChatChannel, ChatMessage, ChatUser } from '../../lib/chat/types';
import { Avatar } from './MessageItem';

interface Props {
  users: ChatUser[];
  channelName: (id: string) => string;
  channels: ChatChannel[];
  dmIds: string[];
}

export function SearchPanel({ users, channelName, channels, dmIds }: Props) {
  const [term, setTerm] = useState('');
  const [fromUid, setFromUid] = useState('');
  const [channelId, setChannelId] = useState('');
  const [hasImage, setHasImage] = useState(false);
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!term.trim() && !fromUid && !hasImage) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await searchMessages(term, { fromUid: fromUid || undefined, channelId: channelId || undefined, hasImage }, dmIds));
      } catch (err: any) {
        console.error(err);
        setError(
          err?.code === 'failed-precondition'
            ? 'Search needs a one-time Firestore index. Open the browser console for the link, or see TEAM_CHAT.md.'
            : err?.message || 'Search failed'
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, fromUid, channelId, hasImage, dmIds]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 border-b border-brand-border space-y-3 bg-white">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search messages — words, names, or an order number"
            className="w-full rounded-xl border border-brand-border pl-9 pr-3 py-2.5 text-[16px] md:text-sm focus:outline-none focus:border-brand-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <select value={fromUid} onChange={(e) => setFromUid(e.target.value)} className="rounded-lg border border-brand-border px-2 py-1.5 bg-white">
            <option value="">From anyone</option>
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </select>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-brand-border px-2 py-1.5 bg-white max-w-[180px]">
            <option value="">In any chat</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{channelName(c.id)}</option>
            ))}
          </select>
          <button
            onClick={() => setHasImage((v) => !v)}
            className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5', hasImage ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border bg-white')}
          >
            <ImageIcon size={14} /> Has photo
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-6 flex justify-center text-brand-secondary">
            <Loader2 className="animate-spin" size={20} />
          </div>
        )}
        {error && <div className="p-4 text-sm text-red-600">{error}</div>}
        {!loading && results && results.length === 0 && (
          <div className="p-8 text-center text-sm text-brand-secondary">No messages match. Try a single distinctive word.</div>
        )}
        {!loading && results === null && (
          <div className="p-8 text-center text-sm text-brand-secondary">
            Search finds whole words. Try a customer name, a color, or an order number like <b>2212</b>.
          </div>
        )}
        {!loading &&
          results?.map((m) => <ResultRow key={`${m.channelId}-${m.id}`} m={m} channelLabel={channelName(m.channelId)} />)}
      </div>
    </div>
  );
}

export function ResultRow({ m, channelLabel }: { m: ChatMessage; channelLabel: string }) {
  return (
    <Link
      to={`/chat/${m.channelId}?m=${m.id}`}
      className="flex gap-3 px-4 py-3 border-b border-brand-border hover:bg-brand-muted"
    >
      <Avatar uid={m.authorId} name={m.authorName} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs text-brand-secondary">
          <span className="font-semibold text-brand-primary text-sm">{m.authorName}</span>
          <span>in {channelLabel}</span>
          <span className="ml-auto shrink-0">{formatTime(tsMillis(m.createdAt))}</span>
        </div>
        <div className="text-sm text-brand-primary line-clamp-2 break-words">
          {m.text || (m.attachments?.[0]?.isImage ? '📷 Photo' : '📎 File')}
        </div>
      </div>
    </Link>
  );
}
