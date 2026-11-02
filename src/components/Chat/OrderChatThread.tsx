import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, MessagesSquare } from 'lucide-react';
import { ensureOrderChannel, orderChannelId, subscribeChannel } from '../../lib/chat/chatService';
import { useChatDirectory } from '../../lib/chat/useChatDirectory';
import type { ChatChannel } from '../../lib/chat/types';
import { useChatMe } from '../../lib/chat/useChatMe';
import { MessageFeed } from './MessageFeed';
import { Composer } from './Composer';

/**
 * The team conversation for one order, shown on the order page.
 * The thread is created the first time someone posts in it.
 */
export function OrderChatThread({ orderId, title }: { orderId: string; title?: string }) {
  const me = useChatMe();
  const { users, orders, designs } = useChatDirectory();
  const channelId = orderChannelId(orderId);
  const [channel, setChannel] = useState<ChatChannel | null>(null);

  useEffect(() => subscribeChannel(channelId, setChannel), [channelId]);

  return (
    <div className="bg-white rounded-card border border-brand-border shadow-sm flex flex-col overflow-hidden h-[520px]">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <MessagesSquare className="text-brand-primary" size={20} />
          <h3 className="font-serif text-2xl tracking-tight text-brand-primary">Team Thread</h3>
        </div>
        <Link
          to={`/chat/${channelId}`}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-brand-border hover:border-brand-primary text-brand-secondary hover:text-brand-primary"
          title="Open in Team Chat"
        >
          <Maximize2 size={13} /> Open in chat
        </Link>
      </div>

      <MessageFeed
        channelId={channelId}
        myUid={me.uid}
        canModerate={['Admin', 'Leadership', 'Manager'].includes(me.role)}
        emptyHint={
          <span>
            Nothing here yet. Questions, approvals and photos for <b>{orderId}</b> go here, and anything that tags{' '}
            <b>#{orderId}</b> in other channels shows up too.
          </span>
        }
      />
      <Composer
        channel={{ id: channelId, name: orderId, type: 'order' }}
        me={{ uid: me.uid, name: me.name }}
        users={users}
        orders={orders}
        designs={designs}
        placeholder={`Message the team about ${orderId}…`}
        beforeSend={channel ? undefined : async () => { await ensureOrderChannel(orderId, title); }}
      />
    </div>
  );
}
