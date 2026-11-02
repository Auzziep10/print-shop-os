import { useMemo, useRef, useState } from 'react';
import { Loader2, Package, Palette, Paperclip, Send, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sendMessage, uploadAttachment } from '../../lib/chat/chatService';
import { detectOrderRefs } from '../../lib/chat/text';
import type { ChatAttachment, ChatChannel, ChatMention, ChatRef } from '../../lib/chat/types';
import type { DirectoryDesign, DirectoryOrder } from '../../lib/chat/useChatDirectory';
import type { ChatUser } from '../../lib/chat/types';
import { Avatar } from './MessageItem';

interface Props {
  channel: Pick<ChatChannel, 'id' | 'name' | 'type'>;
  me: { uid: string; name: string };
  users: ChatUser[];
  orders: DirectoryOrder[];
  designs: DirectoryDesign[];
  placeholder?: string;
  /** Called before the first send, e.g. to create an order thread. */
  beforeSend?: () => Promise<void>;
}

type Suggestion =
  | { kind: 'user'; key: string; user: ChatUser }
  | { kind: 'order'; key: string; order: DirectoryOrder }
  | { kind: 'design'; key: string; design: DirectoryDesign };

interface Pending {
  id: string;
  file: File;
  preview?: string;
  status: 'uploading' | 'done' | 'error';
  result?: ChatAttachment;
  error?: string;
}

export function Composer({ channel, me, users, orders, designs, placeholder, beforeSend }: Props) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [refs, setRefs] = useState<ChatRef[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [trigger, setTrigger] = useState<{ char: '@' | '#'; query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const orderIds = useMemo(() => new Set(orders.map((o) => o.id)), [orders]);

  const suggestions: Suggestion[] = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    if (trigger.char === '@') {
      return users
        .filter((u) => u.uid !== me.uid && (!q || u.name.toLowerCase().includes(q)))
        .slice(0, 8)
        .map((u) => ({ kind: 'user' as const, key: u.uid, user: u }));
    }
    const digits = q.replace(/^ord-?/, '');
    const os = orders
      .filter(
        (o) =>
          !q ||
          o.id.toLowerCase().includes(q) ||
          (digits && o.id.includes(digits)) ||
          o.title.toLowerCase().includes(q) ||
          (o.customerName || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map((o) => ({ kind: 'order' as const, key: `o-${o.id}`, order: o }));
    const ds = q
      ? designs
          .filter((d) => d.name.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q))
          .slice(0, 4)
          .map((d) => ({ kind: 'design' as const, key: `d-${d.customerId}-${d.id}`, design: d }))
      : [];
    return [...os, ...ds];
  }, [trigger, users, orders, designs, me.uid]);

  const updateTrigger = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)([@#])([^\s@#]{0,30})$/);
    if (m) {
      setTrigger({ char: m[2] as '@' | '#', query: m[3], start: caret - m[3].length - 1 });
      setActive(0);
    } else {
      setTrigger(null);
    }
  };

  const insert = (s: Suggestion) => {
    if (!trigger) return;
    const ta = taRef.current!;
    const caret = ta.selectionStart;
    let label: string;
    if (s.kind === 'user') {
      label = `@${s.user.name}`;
      setMentions((prev) => (prev.some((p) => p.uid === s.user.uid) ? prev : [...prev, { uid: s.user.uid, name: s.user.name }]));
    } else if (s.kind === 'order') {
      label = `#${s.order.id}`;
      setRefs((prev) => (prev.some((p) => p.label === label) ? prev : [...prev, { type: 'order', id: s.order.id, label }]));
    } else {
      label = `#${s.design.name}`;
      setRefs((prev) =>
        prev.some((p) => p.label === label)
          ? prev
          : [...prev, { type: 'design', id: s.design.id, label, customerId: s.design.customerId }]
      );
    }
    const next = text.slice(0, trigger.start) + label + ' ' + text.slice(caret);
    setText(next);
    setTrigger(null);
    requestAnimationFrame(() => {
      const pos = trigger.start + label.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 10);
    list.forEach((file) => {
      const id = `${Date.now()}-${Math.random()}`;
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setPending((p) => [...p, { id, file, preview, status: 'uploading' }]);
      uploadAttachment(channel.id, file)
        .then((result) => setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'done', result } : x))))
        .catch((err) =>
          setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'error', error: err?.message || 'Upload failed' } : x)))
        );
    });
  };

  const removePending = (id: string) =>
    setPending((p) => {
      const x = p.find((y) => y.id === id);
      if (x?.preview) URL.revokeObjectURL(x.preview);
      return p.filter((y) => y.id !== id);
    });

  const uploading = pending.some((p) => p.status === 'uploading');
  const canSend = !sending && !uploading && (text.trim().length > 0 || pending.some((p) => p.status === 'done'));

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await beforeSend?.();
      const finalText = text.trim();
      const usedMentions = mentions.filter((m) => finalText.includes(`@${m.name}`));
      const usedRefs = refs.filter((r) => finalText.includes(r.label));
      const autoRefs = detectOrderRefs(finalText, orderIds, usedRefs);
      await sendMessage({
        channel,
        text: finalText,
        author: me,
        mentions: usedMentions,
        refs: [...usedRefs, ...autoRefs],
        attachments: pending.filter((p) => p.status === 'done' && p.result).map((p) => p.result!),
      });
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setText('');
      setMentions([]);
      setRefs([]);
      setPending([]);
      taRef.current?.focus();
    } catch (err: any) {
      setError(err?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insert(suggestions[active]);
        return;
      }
      if (e.key === 'Escape') {
        setTrigger(null);
        return;
      }
    }
    // Enter sends on desktop; on phones the return key adds a new line and the button sends.
    const touch = window.matchMedia('(hover: none)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !touch) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      className={cn('border-t border-brand-border bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] relative', dragging && 'ring-2 ring-inset ring-sky-400')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {/* Autocomplete */}
      {trigger && suggestions.length > 0 && (
        <div className="absolute left-3 right-3 bottom-full mb-1 bg-white border border-brand-border rounded-xl shadow-lg overflow-hidden z-30 max-h-72 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border">
            {trigger.char === '@' ? 'Teammates' : 'Orders & designs'}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.key}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('w-full flex items-center gap-3 px-3 py-2 text-left text-sm', i === active && 'bg-brand-muted')}
            >
              {s.kind === 'user' && (
                <>
                  <Avatar uid={s.user.uid} name={s.user.name} size={24} />
                  <span className="font-medium">{s.user.name}</span>
                  <span className="text-xs text-brand-secondary ml-auto">{s.user.role}</span>
                </>
              )}
              {s.kind === 'order' && (
                <>
                  <Package size={16} className="text-brand-secondary shrink-0" />
                  <span className="font-medium shrink-0">{s.order.id}</span>
                  <span className="truncate text-brand-secondary">
                    {[s.order.customerName, s.order.title].filter(Boolean).join(' · ')}
                  </span>
                </>
              )}
              {s.kind === 'design' && (
                <>
                  <Palette size={16} className="text-brand-secondary shrink-0" />
                  <span className="font-medium truncate">{s.design.name}</span>
                  <span className="truncate text-brand-secondary ml-auto text-xs">{s.design.customerName}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Pending uploads */}
      {pending.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {pending.map((p) => (
            <div key={p.id} className="relative shrink-0 w-16 h-16 rounded-lg border border-brand-border bg-brand-muted overflow-hidden">
              {p.preview ? (
                <img src={p.preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-center p-1 break-all text-brand-secondary">
                  {p.file.name}
                </div>
              )}
              {p.status === 'uploading' && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              )}
              {p.status === 'error' && (
                <div className="absolute inset-0 bg-red-50/90 flex items-center justify-center text-[10px] text-red-700 p-1 text-center" title={p.error}>
                  Failed
                </div>
              )}
              <button
                onClick={() => removePending(p.id)}
                className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"
                aria-label="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-xs text-red-600 pb-1">{error}</div>}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-lg text-brand-secondary hover:text-brand-primary hover:bg-brand-muted shrink-0"
          title="Attach photos or files"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          placeholder={placeholder || `Message #${channel.name}  —  @ to tag someone, # for an order or design`}
          onChange={(e) => {
            setText(e.target.value);
            updateTrigger(e.target.value, e.target.selectionStart);
            const ta = e.target;
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) updateTrigger(text, e.currentTarget.selectionStart);
          }}
          onBlur={() => setTimeout(() => setTrigger(null), 150)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          className="flex-1 resize-none rounded-xl border border-brand-border px-3 py-2 text-[16px] md:text-sm leading-snug focus:outline-none focus:border-brand-primary max-h-40"
        />
        <button
          onClick={send}
          disabled={!canSend}
          className="p-2.5 rounded-xl bg-brand-primary text-white disabled:opacity-30 shrink-0"
          title="Send"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
