# Team Chat (Phase 1)

Built-in team messaging for Print Shop OS, replacing the shop's iOS group chats.
Runs entirely on the Firebase project the app already uses — no new services, no
monthly cost.

## What's in it

| Feature | Where |
| --- | --- |
| Team channels (#general, #production, #art, #shipping + any you create) | `/chat` |
| Direct messages between two teammates | `/chat` → **+** |
| A thread for every order, shown on the order page and in chat | Order page → **Team Thread** |
| `@` to tag a teammate, `#` to tag an order or saved design — tags are tappable links | Composer |
| Typing `#2212` by hand also becomes a link to ORD-2212 | Composer |
| Tagging an order in any channel copies a backlink into that order's thread | automatic |
| Photos & files (drag/drop, paste, or 📎). Photos are compressed in the browser and get thumbnails | Composer |
| Unread dots per conversation + a count on the sidebar link | Sidebar |
| Mentions inbox | `/chat/mentions` |
| Search by words, person, conversation, "has photo" | `/chat/search` |
| Edit history (earlier versions kept), soft delete (hidden, never erased), reactions | Message hover / tap |

## One-time Firebase setup (5 minutes)

1. **Security rules** — paste `firebase/chat-firestore.rules` into Firebase Console →
   Firestore → Rules (inside the existing `match /databases/{database}/documents` block)
   and publish. Do the same with `firebase/chat-storage.rules` under Storage → Rules.
   If your rules are currently wide-open "test mode", chat works without this, but
   adding them is what keeps customers out of team conversations.
2. **Open Team Chat once as an Admin.** That creates the default channels and fills
   the `chatMembers` access list from the team roster (everyone whose role isn't
   Client or Pending). It re-syncs every time an Admin/Leadership account opens chat,
   so new hires get access automatically.
3. **Search & Mentions indexes** — the first time someone searches or opens Mentions,
   the browser console shows a Firestore error with a link. Click it and press
   **Create** (once for `keywords`, once for `mentionIds`). Or, with the Firebase CLI:
   `firebase deploy --only firestore:indexes` using `firebase/chat-firestore.indexes.json`.

## How it's stored

```
chatChannels/{channelId}                     channel info + last-message preview
chatChannels/{channelId}/messages/{id}       team channels & order threads
chatChannels/{dm_uidA_uidB}/dmMessages/{id}  direct messages (private to the two people)
chatReads/{uid}                              unread markers
chatMembers/{uid}                            who can use chat
Storage: chat/{channelId}/{uid}/...          uploads
```

Channel ids are predictable: `general`, `order_ORD-2212`, `dm_<uid>_<uid>`.

Search is free because each message stores its own `keywords` list (lowercased words,
order numbers, author, `has:image`, …) and Firestore matches on it. It finds whole
words, not partial spellings.

## Code map

- `src/lib/chat/` — types, Firestore/Storage operations, tagging & search helpers, hooks
- `src/components/Chat/` — message feed, message row, composer, search, order thread panel
- `src/pages/Chat/ChatPage.tsx` — the `/chat` screen (list + conversation; phone-friendly)
- Wired in: `App.tsx` (routes), `Sidebar.tsx` (link + unread count), `OrderDetail.tsx` (Team Thread panel)

## Next phases

- **Phase 2:** push notifications for @mentions and DMs (Firebase Cloud Messaging), "Save to order" on chat photos
- **Phase 3:** AI — "catch me up", pinned order summaries, ask-the-chat (Gemini free tier, called from a server function)
