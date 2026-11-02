// Team Chat — text helpers: search keywords and splitting message text into chips.
import type { ChatMention, ChatRef, ChatAttachment } from './types';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our',
  'out', 'has', 'him', 'his', 'how', 'its', 'let', 'she', 'too', 'use', 'that', 'with', 'have', 'this',
  'will', 'your', 'from', 'they', 'been', 'were', 'what', 'when', 'just', 'into', 'than', 'then', 'them',
]);

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9#@-]+/)
    .map((t) => t.replace(/^[#@-]+|-+$/g, ''))
    // "dtf-film" is also findable as "dtf" and "film"
    .flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Search tokens stored on every message. Firestore can't do full-text search,
 * so we index words ourselves and query with array-contains.
 * Special tokens:  has:image  has:file  from:<uid>  ref:<id>
 */
export function buildKeywords(opts: {
  text: string;
  authorId: string;
  authorName: string;
  mentions: ChatMention[];
  refs: ChatRef[];
  attachments: ChatAttachment[];
}): string[] {
  const set = new Set<string>();
  tokenize(opts.text).forEach((t) => set.add(t));
  tokenize(opts.authorName).forEach((t) => set.add(t));
  opts.mentions.forEach((m) => tokenize(m.name).forEach((t) => set.add(t)));
  opts.refs.forEach((r) => {
    set.add(`ref:${r.id.toLowerCase()}`);
    const id = r.id.toLowerCase();
    set.add(id);
    const digits = id.match(/\d{3,}/)?.[0];
    if (digits) set.add(digits);
    tokenize(r.label).forEach((t) => set.add(t));
  });
  opts.attachments.forEach((a) => {
    set.add(a.isImage ? 'has:image' : 'has:file');
    tokenize(a.name.replace(/\.[a-z0-9]+$/i, '')).forEach((t) => set.add(t));
  });
  set.add(`from:${opts.authorId}`);
  // Firestore docs can hold far more, but keep the index lean.
  return Array.from(set).slice(0, 120);
}

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string; mention: ChatMention }
  | { kind: 'ref'; value: string; ref: ChatRef }
  | { kind: 'link'; value: string };

/** Split message text into plain text, @mention chips, #ref chips and links. */
export function segmentText(text: string, mentions: ChatMention[], refs: ChatRef[]): TextSegment[] {
  const tokens: Array<{ label: string; seg: TextSegment }> = [];
  mentions.forEach((m) => tokens.push({ label: `@${m.name}`, seg: { kind: 'mention', value: `@${m.name}`, mention: m } }));
  refs.forEach((r) => tokens.push({ label: r.label, seg: { kind: 'ref', value: r.label, ref: r } }));
  // Longest first so "@Ann Marie" wins over "@Ann"
  tokens.sort((a, b) => b.label.length - a.label.length);

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = [...tokens.map((t) => escape(t.label)), 'https?:\\/\\/[^\\s]+'];
  const re = new RegExp(`(${parts.join('|')})`, 'g');

  const out: TextSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
    const hit = tokens.find((t) => t.label === m![0]);
    out.push(hit ? hit.seg : { kind: 'link', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

/** Where a ref chip should take you inside Print Shop OS. */
export function refHref(ref: ChatRef): string {
  switch (ref.type) {
    case 'order':
      return `/orders/${encodeURIComponent(ref.id)}`;
    case 'design':
      return `/customers/${encodeURIComponent(ref.customerId || '')}?tab=designs&design=${encodeURIComponent(ref.id)}`;
    case 'customer':
      return `/customers/${encodeURIComponent(ref.id)}`;
  }
}

/**
 * Pick up order numbers typed by hand ("#2212", "#ORD-2212") that weren't chosen
 * from the autocomplete, so they still become links.
 */
export function detectOrderRefs(text: string, knownOrderIds: Set<string>, existing: ChatRef[]): ChatRef[] {
  const found: ChatRef[] = [];
  const have = new Set(existing.map((r) => r.label));
  const re = /#((?:ORD-)?\d{3,7})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].toUpperCase();
    const id = raw.startsWith('ORD-') ? raw : `ORD-${raw}`;
    const label = m[0];
    if (have.has(label) || !knownOrderIds.has(id)) continue;
    have.add(label);
    found.push({ type: 'order', id, label });
  }
  return found;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export function dayLabel(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
