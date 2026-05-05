import { cn } from '../../lib/utils';

export type StatusType = 'quote' | 'notified' | 'quote_sent' | 'approved' | 'awaiting_payment' | 'shopping' | 'ordered' | 'processing' | 'shipped' | 'received' | 'inventory' | 'live';

interface StatusBadgeProps {
  status: StatusType;
  subStatus?: string;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; bg: string; text: string; dot: string }> = {
  quote: { label: 'Request Created', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
  notified: { label: 'Under Review', bg: 'bg-slate-200', text: 'text-slate-800', dot: 'bg-slate-600' },
  quote_sent: { label: 'Quote Prepared', bg: 'bg-cyan-100', text: 'text-cyan-800', dot: 'bg-cyan-500' },
  approved: { label: 'Approved', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  awaiting_payment: { label: 'Awaiting Payment', bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500' },
  shopping: { label: 'Sourcing', bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500' },
  ordered: { label: 'Ordered', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  processing: { label: 'In Production', bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  shipped: { label: 'Shipped', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  received: { label: 'Received', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  inventory: { label: 'Inventory', bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  live: { label: 'Live', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

export function StatusBadge({ status, subStatus, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.quote;

  return (
    <div className={cn("inline-flex flex-col gap-1 items-start", className)}>
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-transparent", config.bg, config.text)}>
        <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)}></span>
        {config.label}
      </div>
      {subStatus && (
        <span className="text-[10px] bg-brand-bg border border-brand-border px-2 py-0.5 rounded text-brand-secondary font-semibold uppercase tracking-wide">
          {subStatus}
        </span>
      )}
    </div>
  );
}
