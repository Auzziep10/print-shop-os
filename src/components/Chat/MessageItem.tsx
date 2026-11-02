import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CornerDownRight, FileText, MoreHorizontal, Package, Palette, Pencil, SmilePlus, Trash2, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { deleteMessage, editMessage, toggleReaction, tsMillis } from '../../lib/chat/chatService';
import { formatTime, refHref, segmentText } from '../../lib/chat/text';
import type { ChatMessage, ChatRef } from '../../lib/chat/types';

const QUICK_REACTIONS = ['👍', '✅', '👀', '🔥', '❓'];

export function initials(name: string) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const AVATAR_COLORS = ['bg-neutral-900', 'bg-stone-600', 'bg-zinc-500', 'bg-amber-700', 'bg-emerald-700', 'bg-sky-700', 'bg-rose-700'];
export function avatarColor(uid: string) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ uid, name, size = 32 }: { uid: string; name: string; size?: number }) {
  return (
    <div
      className={cn('rounded-full text-white flex items-center justify-center font-semibold shrink-0', avatarColor(uid))}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function RefChip({ r }: { r: ChatRef }) {
  const Icon = r.type === 'order' ? Package : r.type === 'design' ? Palette : User;
  return (
    <Link
      to={refHref(r)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-brand-muted border border-brand-border text-brand-primary text-[0.92em] font-medium hover:bg-white hover:border-brand-primary transition-colors align-baseline"
      title={r.type === 'order' ? `Open order ${r.id}` : r.type === 'design' ? 'Open design' : 'Open customer'}
    >
      <Icon size={12} strokeWidth={2} />
      {r.label.replace(/^#/, '')}
    </Link>
  );
}

interface Props {
  message: ChatMessage;
  myUid: string;
  compact: boolean; // same author within a few minutes → hide name/avatar
  highlighted?: boolean;
  canModerate?: boolean;
  onOpenImage?: (url: string) => void;
}

export function MessageItem({ message: m, myUid, compact, highlighted, canModerate, onOpenImage }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Phones have no hover: a tap on the message shows its actions.
  const [tapped, setTapped] = useState(false);
  const mine = m.authorId === myUid;
  const ms = tsMillis(m.createdAt) || Date.now();

  if (m.deleted) {
    return (
      <div className="px-4 py-1 pl-[60px] text-xs italic text-brand-secondary" id={`msg-${m.id}`}>
        Message removed{m.deletedBy && m.deletedBy !== m.authorId ? ' by a manager' : ''}
      </div>
    );
  }

  const save = async () => {
    await editMessage(m, draft);
    setEditing(false);
  };

  return (
    <div
      id={`msg-${m.id}`}
      onClick={(e) => {
        if (!window.matchMedia('(hover: none)').matches) return;
        if ((e.target as HTMLElement).closest('a,button,textarea')) return;
        setTapped((v) => !v);
        setMenuOpen(false);
      }}
      className={cn(
        'group relative flex gap-3 px-4 hover:bg-brand-muted/60 transition-colors',
        compact ? 'py-0.5' : 'pt-3 pb-0.5',
        highlighted && 'bg-amber-50 hover:bg-amber-50 ring-1 ring-amber-200'
      )}
    >
      <div className="w-8 shrink-0">
        {!compact ? (
          <Avatar uid={m.authorId} name={m.authorName} />
        ) : (
          <span className="hidden group-hover:block text-[10px] text-brand-secondary pt-1 text-right">
            {new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-brand-primary">{m.authorName}</span>
            <span className="text-[11px] text-brand-secondary" title={new Date(ms).toLocaleString()}>
              {formatTime(ms)}
            </span>
          </div>
        )}

        {m.system?.kind === 'crosspost' && (
          <Link
            to={`/chat/${m.system.sourceChannelId}?m=${m.system.sourceMessageId}`}
            className="flex items-center gap-1 text-[11px] text-brand-secondary hover:text-brand-primary mb-0.5"
          >
            <CornerDownRight size={11} /> Tagged this order in #{m.system.sourceChannelName}
          </Link>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  save();
                }
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-full rounded-md border border-brand-border p-2 text-sm focus:outline-none focus:border-brand-primary"
              rows={Math.min(6, draft.split('\n').length + 1)}
              autoFocus
            />
            <div className="flex gap-2 mt-1 text-xs">
              <button onClick={save} className="px-3 py-1 rounded-md bg-brand-primary text-white">Save</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-md border border-brand-border">Cancel</button>
            </div>
          </div>
        ) : (
          m.text && (
            <div className="text-sm text-brand-primary whitespace-pre-wrap break-words leading-relaxed">
              {segmentText(m.text, m.mentions || [], m.refs || []).map((s, i) => {
                if (s.kind === 'mention')
                  return (
                    <span
                      key={i}
                      className={cn(
                        'px-1 rounded font-medium',
                        s.mention.uid === myUid ? 'bg-amber-100 text-amber-900' : 'bg-sky-50 text-sky-800'
                      )}
                    >
                      {s.value}
                    </span>
                  );
                if (s.kind === 'ref') return <RefChip key={i} r={s.ref} />;
                if (s.kind === 'link')
                  return (
                    <a key={i} href={s.value} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
                      {s.value}
                    </a>
                  );
                return <span key={i}>{s.value}</span>;
              })}
              {m.editedAt !== undefined && m.history && m.history.length > 0 && (
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className="ml-1 text-[11px] text-brand-secondary hover:underline"
                  title="Show earlier versions"
                >
                  (edited)
                </button>
              )}
            </div>
          )
        )}

        {showHistory && m.history && (
          <div className="mt-1 mb-1 border-l-2 border-brand-border pl-3 space-y-1">
            {m.history.map((h, i) => (
              <div key={i} className="text-xs text-brand-secondary">
                <span className="font-medium">{formatTime(h.editedAt)}:</span> {h.text}
              </div>
            ))}
          </div>
        )}

        {m.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1.5">
            {m.attachments.map((a) =>
              a.isImage ? (
                <button
                  key={a.storagePath}
                  onClick={() => onOpenImage?.(a.url)}
                  className="block rounded-lg overflow-hidden border border-brand-border bg-brand-muted hover:opacity-90"
                  title={a.name}
                >
                  <img
                    src={a.thumbUrl || a.url}
                    alt={a.name}
                    loading="lazy"
                    className="max-h-56 max-w-[260px] object-cover"
                    style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
                  />
                </button>
              ) : (
                <a
                  key={a.storagePath}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-border bg-white hover:border-brand-primary text-sm max-w-[260px]"
                >
                  <FileText size={18} className="text-brand-secondary shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <span className="text-[11px] text-brand-secondary shrink-0">{(a.size / 1024 / 1024).toFixed(1)} MB</span>
                </a>
              )
            )}
          </div>
        )}

        {m.reactions && Object.keys(m.reactions).some((k) => m.reactions![k].length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(m.reactions)
              .filter(([, uids]) => uids.length > 0)
              .map(([emoji, uids]) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(m, emoji)}
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-xs border',
                    uids.includes(myUid) ? 'bg-sky-50 border-sky-300' : 'bg-white border-brand-border'
                  )}
                >
                  {emoji} {uids.length}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {!editing && !m.system && (
        <div
          className={cn(
            'absolute right-3 -top-3 items-center bg-white border border-brand-border rounded-lg shadow-sm z-10',
            tapped ? 'flex' : 'hidden group-hover:flex'
          )}
        >
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} onClick={() => toggleReaction(m, e)} className="px-1.5 py-1 hover:bg-brand-muted text-sm" title={`React ${e}`}>
              {e}
            </button>
          ))}
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="px-1.5 py-1 hover:bg-brand-muted text-brand-secondary" title="More">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-40 bg-white border border-brand-border rounded-lg shadow-lg py-1 z-20 text-sm"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <div className="flex px-2 py-1 gap-1 border-b border-brand-border">
                  {QUICK_REACTIONS.slice(3).map((e) => (
                    <button key={e} onClick={() => { toggleReaction(m, e); setMenuOpen(false); }} className="p-1 hover:bg-brand-muted rounded">
                      {e}
                    </button>
                  ))}
                  <SmilePlus size={14} className="text-brand-secondary self-center ml-auto" />
                </div>
                {mine && (
                  <button
                    onClick={() => { setDraft(m.text); setEditing(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-brand-muted"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                )}
                {(mine || canModerate) && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (confirm('Remove this message? It stays in the record but is hidden from the chat.')) deleteMessage(m);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
