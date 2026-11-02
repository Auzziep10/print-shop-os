import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AtSign, ExternalLink, Hash, MessageCircle, Package, Plus, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatMe } from '../../lib/chat/useChatMe';
import {
  createChannel,
  ensureDefaultChannels,
  ensureDM,
  subscribeChannel,
  subscribeMentions,
  syncChatMembers,
} from '../../lib/chat/chatService';
import { useChatChannels } from '../../lib/chat/useChatChannels';
import { useChatDirectory } from '../../lib/chat/useChatDirectory';
import { CHAT_ROLES, type ChatChannel, type ChatMessage } from '../../lib/chat/types';
import { MessageFeed } from '../../components/Chat/MessageFeed';
import { Composer } from '../../components/Chat/Composer';
import { Avatar } from '../../components/Chat/MessageItem';
import { ResultRow, SearchPanel } from '../../components/Chat/SearchPanel';

export function ChatPage() {
  const { channelId } = useParams();
  const [params] = useSearchParams();
  const highlightId = params.get('m');
  const navigate = useNavigate();
  const me = useChatMe();
  const { users, orders, designs } = useChatDirectory();
  const state = useChatChannels(me.uid);
  const [loadedChannel, setLoadedChannel] = useState<{ id: string; channel: ChatChannel | null } | null>(null);
  const [showNewDM, setShowNewDM] = useState(false);
  const [mentions, setMentions] = useState<ChatMessage[]>([]);

  const view: 'channel' | 'search' | 'mentions' | 'none' =
    channelId === 'search' ? 'search' : channelId === 'mentions' ? 'mentions' : channelId ? 'channel' : 'none';

  useEffect(() => {
    ensureDefaultChannels().catch((err) => console.warn('[chat] default channels', err));
  }, []);

  // Admins keep the chat access list in step with the team roster.
  useEffect(() => {
    if (!['Admin', 'Leadership'].includes(me.role) || users.length === 0) return;
    syncChatMembers(users, CHAT_ROLES).catch((err) => console.warn('[chat] member sync', err));
  }, [me.role, users]);

  useEffect(() => {
    if (!me.uid) return;
    return subscribeMentions(me.uid, setMentions);
  }, [me.uid]);

  useEffect(() => {
    if (view !== 'channel' || !channelId) return;
    return subscribeChannel(channelId, (c) => setLoadedChannel({ id: channelId, channel: c }));
  }, [view, channelId]);
  // undefined while loading, null if it doesn't exist
  const channel = view === 'channel' && loadedChannel && loadedChannel.id === channelId ? loadedChannel.channel : undefined;

  // Desktop opens straight into #general; phones show the list first.
  useEffect(() => {
    if (!channelId && window.matchMedia('(min-width: 768px)').matches) navigate('/chat/general', { replace: true });
  }, [channelId, navigate]);

  const dmLabel = (c: ChatChannel) => {
    const otherId = c.memberIds?.find((id) => id !== me.uid) || '';
    return users.find((u) => u.uid === otherId)?.name || c.memberNames?.[otherId] || 'Direct message';
  };
  const channelName = (id: string) => {
    const all = [...state.channels, ...state.orderThreads, ...state.dms];
    const c = all.find((x) => x.id === id);
    if (!c) return id.startsWith('order_') ? id.replace('order_', '') : `#${id}`;
    if (c.type === 'dm') return dmLabel(c);
    if (c.type === 'order') return c.name;
    return `#${c.name}`;
  };
  const dmIds = useMemo(() => state.dms.map((d) => d.id), [state.dms]);
  const allSearchable = useMemo(() => [...state.channels, ...state.orderThreads, ...state.dms], [state]);

  const unreadMentions = mentions.filter((m) => {
    const read = state.reads[m.channelId] || 0;
    return (m.createdAt?.toMillis?.() || 0) > read;
  }).length;

  const newChannel = async () => {
    const name = prompt('New channel name (e.g. "embroidery")');
    if (!name) return;
    try {
      const id = await createChannel(name);
      navigate(`/chat/${id}`);
    } catch (err: any) {
      alert(err?.message || 'Could not create channel');
    }
  };

  const startDM = async (u: { uid: string; name: string }) => {
    setShowNewDM(false);
    const id = await ensureDM({ uid: me.uid, name: me.name }, u);
    navigate(`/chat/${id}`);
  };

  const orderForChannel = channel?.type === 'order' ? orders.find((o) => o.id === channel.orderId) : undefined;

  return (
    <div className="flex h-full min-h-0 bg-white">
      {/* Channel list */}
      <aside
        className={cn(
          'w-full md:w-72 shrink-0 border-r border-brand-border bg-brand-bg flex flex-col min-h-0',
          channelId ? 'hidden md:flex' : 'flex'
        )}
      >
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <h1 className="font-serif text-2xl tracking-tight">Team Chat</h1>
          <button onClick={() => setShowNewDM(true)} className="p-2 rounded-lg hover:bg-brand-muted" title="New direct message">
            <Plus size={18} />
          </button>
        </div>

        <div className="px-3 space-y-0.5">
          <NavRow to="/chat/search" active={view === 'search'} icon={<Search size={16} />} label="Search" />
          <NavRow
            to="/chat/mentions"
            active={view === 'mentions'}
            icon={<AtSign size={16} />}
            label="Mentions"
            badge={unreadMentions || undefined}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <Section title="Channels" action={<button onClick={newChannel} className="p-1 rounded hover:bg-brand-muted" title="New channel"><Plus size={14} /></button>}>
            {state.channels.map((c) => (
              <NavRow
                key={c.id}
                to={`/chat/${c.id}`}
                active={channelId === c.id}
                icon={<Hash size={16} />}
                label={c.name}
                unread={state.isUnread(c)}
              />
            ))}
          </Section>

          <Section title="Direct messages" action={<button onClick={() => setShowNewDM(true)} className="p-1 rounded hover:bg-brand-muted" title="New direct message"><Plus size={14} /></button>}>
            {state.dms.length === 0 && <div className="px-3 py-1 text-xs text-brand-secondary">Tap + to message a teammate</div>}
            {state.dms.map((c) => {
              const name = dmLabel(c);
              const other = c.memberIds?.find((id) => id !== me.uid) || c.id;
              return (
                <NavRow
                  key={c.id}
                  to={`/chat/${c.id}`}
                  active={channelId === c.id}
                  icon={<Avatar uid={other} name={name} size={18} />}
                  label={name}
                  unread={state.isUnread(c)}
                />
              );
            })}
          </Section>

          <Section title="Order threads">
            {state.orderThreads.length === 0 && (
              <div className="px-3 py-1 text-xs text-brand-secondary">Tag an order with # or open one to start its thread</div>
            )}
            {state.orderThreads.slice(0, 25).map((c) => (
              <NavRow
                key={c.id}
                to={`/chat/${c.id}`}
                active={channelId === c.id}
                icon={<Package size={16} />}
                label={c.name}
                sub={c.lastMessagePreview}
                unread={state.isUnread(c)}
              />
            ))}
          </Section>
        </div>
      </aside>

      {/* Main */}
      <section className={cn('flex-1 min-w-0 flex flex-col min-h-0', !channelId && 'hidden md:flex')}>
        {view === 'search' && (
          <>
            <Header title="Search" onBack={() => navigate('/chat')} />
            <SearchPanel users={users} channels={allSearchable} channelName={channelName} dmIds={dmIds} />
          </>
        )}

        {view === 'mentions' && (
          <>
            <Header title="Mentions" onBack={() => navigate('/chat')} />
            <div className="flex-1 overflow-y-auto">
              {mentions.length === 0 && (
                <div className="p-8 text-center text-sm text-brand-secondary">When someone @mentions you, it shows up here.</div>
              )}
              {mentions.map((m) => (
                <ResultRow key={`${m.channelId}-${m.id}`} m={m} channelLabel={channelName(m.channelId)} />
              ))}
            </div>
          </>
        )}

        {view === 'channel' && channelId && (
          <>
            <Header
              onBack={() => navigate('/chat')}
              title={
                channel === null
                  ? 'Chat not found'
                  : channel?.type === 'dm'
                    ? dmLabel(channel)
                    : channel?.type === 'order'
                      ? channel.name
                      : `#${channel?.name || channelId}`
              }
              subtitle={
                channel?.type === 'order'
                  ? [orderForChannel?.customerName, orderForChannel?.title || channel.description].filter(Boolean).join(' · ')
                  : channel?.description
              }
              action={
                channel?.type === 'order' && channel.orderId ? (
                  <Link
                    to={`/orders/${channel.orderId}`}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-brand-border hover:border-brand-primary"
                  >
                    Open order <ExternalLink size={14} />
                  </Link>
                ) : null
              }
            />
            {channel === null ? (
              <div className="flex-1 flex items-center justify-center text-sm text-brand-secondary">
                This conversation doesn't exist or you don't have access.
              </div>
            ) : (
              <>
                <MessageFeed
                  channelId={channelId}
                  myUid={me.uid}
                  canModerate={['Admin', 'Leadership', 'Manager'].includes(me.role)}
                  highlightId={highlightId}
                />
                {channel && (
                  <Composer
                    channel={{ id: channel.id, name: channel.type === 'dm' ? dmLabel(channel) : channel.name, type: channel.type }}
                    me={{ uid: me.uid, name: me.name }}
                    users={users}
                    orders={orders}
                    designs={designs}
                    placeholder={channel.type === 'dm' ? `Message ${dmLabel(channel)}` : undefined}
                  />
                )}
              </>
            )}
          </>
        )}

        {view === 'none' && (
          <div className="flex-1 flex flex-col items-center justify-center text-brand-secondary gap-2">
            <MessageCircle size={32} />
            <span className="text-sm">Pick a conversation</span>
          </div>
        )}
      </section>

      {showNewDM && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-end md:items-center justify-center" onClick={() => setShowNewDM(false)}>
          <div className="bg-white w-full md:w-96 rounded-t-2xl md:rounded-2xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <span className="font-semibold">Message a teammate</span>
              <button onClick={() => setShowNewDM(false)} className="p-1"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto">
              {users
                .filter((u) => u.uid !== me.uid)
                .map((u) => (
                  <button key={u.uid} onClick={() => startDM(u)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-muted text-left">
                    <Avatar uid={u.uid} name={u.name} size={28} />
                    <span className="font-medium text-sm">{u.name}</span>
                    <span className="ml-auto text-xs text-brand-secondary">{u.role}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-secondary">{title}</span>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavRow({
  to,
  active,
  icon,
  label,
  sub,
  unread,
  badge,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  unread?: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 md:py-1.5 rounded-lg text-sm transition-colors border border-transparent',
        active ? 'bg-white border-brand-border shadow-sm text-brand-primary' : 'text-brand-secondary hover:bg-brand-muted hover:text-brand-primary',
        unread && !active && 'text-brand-primary font-semibold'
      )}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-[11px] font-normal text-brand-secondary">{sub}</span>}
      </span>
      {unread && !active && <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0" />}
      {badge ? <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5">{badge}</span> : null}
    </Link>
  );
}

function Header({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack: () => void; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 md:px-5 py-3 border-b border-brand-border bg-white shrink-0">
      <button onClick={onBack} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-brand-muted" aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{title}</div>
        {subtitle && <div className="text-xs text-brand-secondary truncate">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

