// Team Chat — Firestore + Storage operations. Everything here runs on the
// Firebase free allowances: no Cloud Functions, no paid search service.
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { buildKeywords, tokenize } from './text';
import {
  DEFAULT_CHANNELS,
  type ChatAttachment,
  type ChatChannel,
  type ChatMention,
  type ChatMessage,
  type ChatRef,
} from './types';

const CHANNELS = 'chatChannels';
const READS = 'chatReads';

const channelsCol = () => collection(db, CHANNELS);
// DMs use a differently named subcollection so collection-group search/mention
// queries over 'messages' only ever touch team-visible channels (Firestore
// rules reject a collection-group query that could return private docs).
export const isDM = (channelId: string) => channelId.startsWith('dm_');
const messagesCol = (channelId: string) =>
  collection(db, CHANNELS, channelId, isDM(channelId) ? 'dmMessages' : 'messages');
const MEMBERS = 'chatMembers';

export const orderChannelId = (orderId: string) => `order_${orderId}`;
export const dmChannelId = (a: string, b: string) => `dm_${[a, b].sort().join('_')}`;

function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function millis(ts: any): number {
  return ts?.toMillis?.() ?? (typeof ts === 'number' ? ts : 0);
}
export { millis as tsMillis };

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Creates #general, #production, #art, #shipping the first time anyone opens chat. */
export async function ensureDefaultChannels(): Promise<void> {
  const uid = currentUid();
  await Promise.all(
    DEFAULT_CHANNELS.map(async (c) => {
      const ref = doc(db, CHANNELS, c.id);
      const snap = await getDoc(ref);
      if (snap.exists()) return;
      await setDoc(ref, {
        type: 'channel',
        name: c.name,
        description: c.description || '',
        createdBy: uid,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      });
    })
  );
}

/** Team channels + order threads (everyone on the team can see these). */
export function subscribeSharedChannels(cb: (channels: ChatChannel[]) => void): Unsubscribe {
  const q = query(channelsCol(), where('type', 'in', ['channel', 'order']));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  });
}

/** Direct messages I'm part of. */
export function subscribeMyDMs(uid: string, cb: (channels: ChatChannel[]) => void): Unsubscribe {
  const q = query(channelsCol(), where('memberIds', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((c) => c.type === 'dm'));
  });
}

export function subscribeChannel(channelId: string, cb: (c: ChatChannel | null) => void): Unsubscribe {
  return onSnapshot(doc(db, CHANNELS, channelId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as ChatChannel) : null);
  });
}

export async function createChannel(name: string, description = ''): Promise<string> {
  const uid = currentUid();
  const id = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (!id) throw new Error('Channel name is empty');
  if (id.startsWith('order_') || id.startsWith('dm_')) throw new Error('That name is reserved');
  const ref = doc(db, CHANNELS, id);
  const snap = await getDoc(ref);
  if (snap.exists()) return id;
  await setDoc(ref, {
    type: 'channel',
    name: id,
    description,
    createdBy: uid,
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  });
  return id;
}

/** Every order gets its own thread; it is created on first use. */
export async function ensureOrderChannel(orderId: string, title?: string): Promise<string> {
  const id = orderChannelId(orderId);
  const ref = doc(db, CHANNELS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: 'order',
      name: orderId,
      orderId,
      description: title || '',
      createdBy: currentUid(),
      createdAt: serverTimestamp(),
      lastMessageAt: null,
    });
  }
  return id;
}

export async function ensureDM(me: { uid: string; name: string }, other: { uid: string; name: string }): Promise<string> {
  const id = dmChannelId(me.uid, other.uid);
  const ref = doc(db, CHANNELS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: 'dm',
      name: '',
      memberIds: [me.uid, other.uid].sort(),
      memberNames: { [me.uid]: me.name, [other.uid]: other.name },
      createdBy: me.uid,
      createdAt: serverTimestamp(),
      lastMessageAt: null,
    });
  }
  return id;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function subscribeMessages(
  channelId: string,
  pageSize: number,
  cb: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(messagesCol(channelId), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ id: d.id, channelId, ...(d.data() as any) })) as ChatMessage[];
    cb(msgs.reverse());
  });
}

export interface SendMessageInput {
  channel: Pick<ChatChannel, 'id' | 'name' | 'type'>;
  text: string;
  author: { uid: string; name: string };
  mentions: ChatMention[];
  refs: ChatRef[];
  attachments: ChatAttachment[];
}

/**
 * Sends a message. If it tags an order and isn't already in that order's
 * thread, a backlink is posted into the order thread in the same batch so the
 * order's history stays complete.
 */
export async function sendMessage(input: SendMessageInput): Promise<string> {
  const { channel, text, author, mentions, refs, attachments } = input;
  const trimmed = text.trim();
  if (!trimmed && attachments.length === 0) throw new Error('Empty message');

  const batch = writeBatch(db);
  const msgRef = doc(messagesCol(channel.id));
  const keywords = buildKeywords({ text: trimmed, authorId: author.uid, authorName: author.name, mentions, refs, attachments });

  batch.set(msgRef, {
    channelId: channel.id,
    authorId: author.uid,
    authorName: author.name,
    text: trimmed,
    createdAt: serverTimestamp(),
    mentions,
    mentionIds: mentions.map((m) => m.uid),
    refs,
    attachments,
    keywords,
    reactions: {},
    deleted: false,
  });

  const preview = trimmed ? trimmed.slice(0, 140) : attachments[0]?.isImage ? '📷 Photo' : '📎 File';
  batch.set(
    doc(db, CHANNELS, channel.id),
    { lastMessageAt: serverTimestamp(), lastMessagePreview: preview, lastMessageAuthor: author.name, lastMessageAuthorId: author.uid },
    { merge: true }
  );

  // Cross-post into each tagged order's thread (DM content stays private).
  if (channel.type !== 'dm') {
    const orderRefs = refs.filter((r) => r.type === 'order' && orderChannelId(r.id) !== channel.id);
    const seen = new Set<string>();
    for (const r of orderRefs) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const threadId = orderChannelId(r.id);
      const backRef = doc(messagesCol(threadId));
      batch.set(backRef, {
        channelId: threadId,
        authorId: author.uid,
        authorName: author.name,
        text: trimmed,
        createdAt: serverTimestamp(),
        mentions,
        mentionIds: [], // don't double-notify
        refs,
        attachments,
        keywords: [], // original message is the searchable copy
        reactions: {},
        deleted: false,
        system: {
          kind: 'crosspost',
          sourceChannelId: channel.id,
          sourceChannelName: channel.name,
          sourceMessageId: msgRef.id,
        },
      });
      batch.set(
        doc(db, CHANNELS, threadId),
        {
          type: 'order',
          name: r.id,
          orderId: r.id,
          lastMessageAt: serverTimestamp(),
          lastMessagePreview: `${author.name} in #${channel.name}: ${preview}`.slice(0, 140),
          lastMessageAuthor: author.name,
          lastMessageAuthorId: author.uid,
        },
        { merge: true }
      );
    }
  }

  await batch.commit();
  return msgRef.id;
}

/** Edits keep the previous version in `history` so nothing is silently rewritten. */
export async function editMessage(msg: ChatMessage, newText: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed || trimmed === msg.text) return;
  const keywords = buildKeywords({
    text: trimmed,
    authorId: msg.authorId,
    authorName: msg.authorName,
    mentions: msg.mentions || [],
    refs: msg.refs || [],
    attachments: msg.attachments || [],
  });
  await updateDoc(doc(messagesCol(msg.channelId), msg.id), {
    text: trimmed,
    keywords,
    editedAt: serverTimestamp(),
    history: arrayUnion({ text: msg.text, editedAt: Date.now() }),
  });
}

/** Soft delete: hidden in the feed, still on record. */
export async function deleteMessage(msg: ChatMessage): Promise<void> {
  await updateDoc(doc(messagesCol(msg.channelId), msg.id), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: currentUid(),
    keywords: [],
  });
}

export async function toggleReaction(msg: ChatMessage, emoji: string): Promise<void> {
  const uid = currentUid();
  const has = msg.reactions?.[emoji]?.includes(uid);
  await updateDoc(doc(messagesCol(msg.channelId), msg.id), {
    [`reactions.${emoji}`]: has ? arrayRemove(uid) : arrayUnion(uid),
  });
}

// ---------------------------------------------------------------------------
// Read state (unread badges)
// ---------------------------------------------------------------------------

export function subscribeReads(uid: string, cb: (reads: Record<string, number>) => void): Unsubscribe {
  return onSnapshot(doc(db, READS, uid), (snap) => cb((snap.data()?.reads as Record<string, number>) || {}));
}

export async function markRead(uid: string, channelId: string): Promise<void> {
  await setDoc(doc(db, READS, uid), { reads: { [channelId]: Date.now() } }, { merge: true });
}

// ---------------------------------------------------------------------------
// Search & mentions (free: keyword index + collection-group queries)
// ---------------------------------------------------------------------------

export interface SearchFilters {
  fromUid?: string;
  channelId?: string;
  hasImage?: boolean;
}

/**
 * Finds messages containing every word in `term`. Firestore allows one
 * array-contains per query, so we query on the rarest-looking token and
 * filter the rest here.
 */
export async function searchMessages(
  term: string,
  filters: SearchFilters = {},
  dmChannelIds: string[] = []
): Promise<ChatMessage[]> {
  const words = tokenize(term);
  const required = [...words];
  if (filters.fromUid) required.push(`from:${filters.fromUid}`);
  if (filters.hasImage) required.push('has:image');
  if (required.length === 0) return [];

  // Longest word is usually the most selective.
  const anchor = [...required].sort((a, b) => b.length - a.length)[0];
  const shared = getDocs(query(collectionGroup(db, 'messages'), where('keywords', 'array-contains', anchor), limit(300)));
  // My DMs are searched one conversation at a time (only I can read them).
  const dmSnaps = (dmChannelIds || []).map((id) =>
    getDocs(query(messagesCol(id), where('keywords', 'array-contains', anchor), limit(100))).catch(() => null)
  );
  const snaps = [await shared, ...(await Promise.all(dmSnaps))].filter(Boolean);

  return snaps
    .flatMap((snap) => snap!.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as ChatMessage))
    .filter((m) => !m.deleted && !m.system)
    .filter((m) => required.every((w) => m.keywords?.includes(w)))
    .filter((m) => !filters.channelId || m.channelId === filters.channelId)
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
    .slice(0, 100);
}

/** Recent messages that @mention me. */
export function subscribeMentions(uid: string, cb: (messages: ChatMessage[]) => void): Unsubscribe {
  const q = query(collectionGroup(db, 'messages'), where('mentionIds', 'array-contains', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as ChatMessage)
        .filter((m) => !m.deleted)
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
      cb(msgs);
    },
    (err) => {
      console.warn('[chat] mentions query needs its index — see TEAM_CHAT.md', err);
      cb([]);
    }
  );
}

// ---------------------------------------------------------------------------
// Access list
// ---------------------------------------------------------------------------
//
// Firestore rules can't look users up by email, and some team records in
// `users` aren't keyed by the login uid. So chat access is a simple allowlist:
// chatMembers/{uid}. Whenever an Admin or Leadership account opens chat, the
// list is synced from the team roster (staff added, clients/pending removed).

export async function hasChatAccess(uid: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, MEMBERS, uid))).exists();
  } catch {
    return false;
  }
}

export async function syncChatMembers(team: Array<{ uid: string; name: string; role: string }>, staffRoles: string[]) {
  const existing = await getDocs(collection(db, MEMBERS));
  const want = new Map(team.filter((t) => staffRoles.includes(t.role)).map((t) => [t.uid, t]));
  const batch = writeBatch(db);
  let changes = 0;
  want.forEach((t, uid) => {
    const cur = existing.docs.find((d) => d.id === uid)?.data();
    if (!cur || cur.role !== t.role || cur.name !== t.name) {
      batch.set(doc(db, MEMBERS, uid), { name: t.name, role: t.role, admin: ['Admin', 'Leadership'].includes(t.role), syncedAt: serverTimestamp() });
      changes++;
    }
  });
  existing.docs.forEach((d) => {
    if (!want.has(d.id)) {
      batch.delete(d.ref);
      changes++;
    }
  });
  if (changes) await batch.commit();
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 25 * 1024 * 1024;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // decode() has finished reading; the element keeps its pixels
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function resize(img: HTMLImageElement, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not compress image'))), 'image/jpeg', quality)
  );
  return { blob, w, h };
}

/**
 * Uploads a file for a message. Photos are shrunk in the browser first
 * (phone photos drop 5-10x) and get a small thumbnail for the feed, which
 * keeps Storage inside the free allowance. PNGs with transparency and
 * design files (PDF, AI, EPS, SVG) are uploaded untouched.
 */
export async function uploadAttachment(channelId: string, file: File): Promise<ChatAttachment> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 25 MB`);
  const uid = currentUid();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  const base = `chat/${channelId}/${uid}/${stamp}`;

  const compressible = /^image\/(jpeg|jpg|heic|heif|webp)$/i.test(file.type);
  const isImage = file.type.startsWith('image/') && !/svg/.test(file.type);

  if (isImage) {
    try {
      const img = await loadImage(file);
      const full = compressible ? await resize(img, 2048, 0.82) : { blob: file as Blob, w: img.naturalWidth, h: img.naturalHeight };
      const thumb = await resize(img, 480, 0.72);
      const fullPath = `${base}/${compressible ? safeName.replace(/\.\w+$/, '') + '.jpg' : safeName}`;
      const thumbPath = `${base}/thumb_${safeName.replace(/\.\w+$/, '')}.jpg`;
      const fullRef = storageRef(storage, fullPath);
      const thumbRef = storageRef(storage, thumbPath);
      await Promise.all([
        uploadBytes(fullRef, full.blob, { contentType: compressible ? 'image/jpeg' : file.type }),
        uploadBytes(thumbRef, thumb.blob, { contentType: 'image/jpeg' }),
      ]);
      const [url, thumbUrl] = await Promise.all([getDownloadURL(fullRef), getDownloadURL(thumbRef)]);
      return {
        url,
        thumbUrl,
        storagePath: fullPath,
        name: file.name,
        contentType: compressible ? 'image/jpeg' : file.type,
        size: full.blob.size,
        width: full.w,
        height: full.h,
        isImage: true,
      };
    } catch (err) {
      console.warn('[chat] image processing failed, uploading original', err);
    }
  }

  const path = `${base}/${safeName}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  return {
    url: await getDownloadURL(r),
    storagePath: path,
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    isImage: false,
  };
}
