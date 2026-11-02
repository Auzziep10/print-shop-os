// Team Chat — shared types
//
// Firestore layout
//   chatChannels/{channelId}                      channel metadata
//   chatChannels/{channelId}/messages/{messageId} messages
//   chatReads/{uid}                               { reads: { [channelId]: lastReadMillis } }
//
// Channel ids are deterministic so threads can be found without a lookup:
//   general, production, art, shipping            team channels
//   order_ORD-2212                                order thread
//   dm_<uidA>_<uidB>                              direct message (uids sorted)

import type { Timestamp } from 'firebase/firestore';

export type ChannelType = 'channel' | 'order' | 'dm';

export interface ChatChannel {
  id: string;
  type: ChannelType;
  name: string;               // "production", "ORD-2212", or DM display (unused for DMs)
  description?: string;
  orderId?: string;           // for type === 'order'
  memberIds?: string[];       // for type === 'dm'
  memberNames?: Record<string, string>;
  createdBy: string;
  createdAt: Timestamp | null;
  lastMessageAt: Timestamp | null;
  lastMessagePreview?: string;
  lastMessageAuthor?: string;
  lastMessageAuthorId?: string;
}

/** A tag that links somewhere in Print Shop OS. */
export interface ChatRef {
  type: 'order' | 'design' | 'customer';
  id: string;                 // order id / design id / customer id
  label: string;              // what the chip shows, e.g. "#ORD-2212"
  customerId?: string;        // designs live on a customer record
}

export interface ChatMention {
  uid: string;
  name: string;
}

export interface ChatAttachment {
  url: string;
  thumbUrl?: string;
  storagePath: string;
  name: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  isImage: boolean;
}

export interface ChatEdit {
  text: string;
  editedAt: number;           // millis
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | null;
  mentions: ChatMention[];
  mentionIds: string[];       // flattened for "mentions of me" queries
  refs: ChatRef[];
  attachments: ChatAttachment[];
  keywords: string[];         // lowercased search tokens (see buildKeywords)
  reactions?: Record<string, string[]>; // emoji -> uids
  editedAt?: Timestamp | null;
  history?: ChatEdit[];       // previous versions, oldest first
  deleted?: boolean;
  deletedAt?: Timestamp | null;
  deletedBy?: string;
  /** Backlink posted automatically into an order thread when the order is tagged elsewhere. */
  system?: {
    kind: 'crosspost';
    sourceChannelId: string;
    sourceChannelName: string;
    sourceMessageId: string;
  };
}

export interface ChatUser {
  uid: string;
  name: string;
  role: string;
  email?: string;
}

export const DEFAULT_CHANNELS: Array<Pick<ChatChannel, 'id' | 'name' | 'description'>> = [
  { id: 'general', name: 'general', description: 'Shop-wide announcements and everyday chat' },
  { id: 'production', name: 'production', description: 'Printing, pressing, and what is on the floor today' },
  { id: 'art', name: 'art', description: 'Designs, proofs, and artwork questions' },
  { id: 'shipping', name: 'shipping', description: 'Pickups, packing, and deliveries' },
];

/** Roles that can use team chat. Clients and pending accounts never see it. */
export const CHAT_ROLES = ['Admin', 'Leadership', 'Manager', 'Staff', 'Printer', 'Sales', 'Designer'];
