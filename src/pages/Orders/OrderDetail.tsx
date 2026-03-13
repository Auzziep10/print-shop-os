import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, MessageSquare, Clock, Users, Link as LinkIcon, Download, Image as ImageIcon } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate('/orders')}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Orders
        </button>
        <div className="flex items-center gap-3">
          <PillButton variant="outline" className="gap-2">
            <Download size={16} />
            Invoice
          </PillButton>
          <PillButton variant="filled">
            Edit Order
          </PillButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Order Information */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Header */}
          <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm">
            <div className="flex justify-between items-start mb-6">
               <div>
                  <h1 className="font-serif text-4xl text-brand-primary mb-2">Wayne Ent</h1>
                  <p className="text-lg text-brand-secondary">250x Event Polos</p>
               </div>
               <div className="text-right">
                  <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-3">Order {id}</p>
                  <StatusBadge status="production" subStatus="Printing" />
               </div>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-brand-border">
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Due Date</span>
                  <span className="font-serif text-lg">Oct 29, 2026</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Total Items</span>
                  <span className="font-serif text-lg">250</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Delivery</span>
                  <span className="font-serif text-lg">Pickup</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Est. Total</span>
                  <span className="font-serif text-lg">$4,500.00</span>
               </div>
            </div>
          </div>

          {/* Garments / Items */}
          <div>
            <h2 className={tokens.typography.h2 + " mb-4"}>Order Items</h2>
            <div className="bg-white rounded-card border border-brand-border overflow-hidden">
               {/* Item Row */}
               <div className="p-6 border-b border-brand-border/50 flex gap-6 items-start hover:bg-brand-bg transition-colors">
                  <div className="w-24 h-24 bg-brand-muted border border-brand-border rounded-lg flex-shrink-0 flex items-center justify-center text-xs text-brand-secondary italic">
                     Image
                  </div>
                  <div className="flex-1">
                     <h3 className="font-serif text-xl mb-1">Port Authority Silk Touch Polo</h3>
                     <p className="text-sm text-brand-secondary mb-3">Color: Jet Black • K500</p>
                     
                     <div className="flex items-center gap-2 mb-4">
                       {['S', 'M', 'L', 'XL', '2XL'].map((size, i) => (
                         <div key={size} className="flex flex-col items-center">
                           <span className="w-8 h-8 rounded border border-brand-border flex items-center justify-center text-xs font-semibold bg-brand-bg mb-1">{size}</span>
                           <span className="text-xs text-brand-secondary font-medium">{[20, 50, 80, 70, 30][i]}</span>
                         </div>
                       ))}
                     </div>
                  </div>
                  <div className="text-right">
                     <span className="font-serif text-xl block">$18.00</span>
                     <span className="text-xs text-brand-secondary">/ ea</span>
                  </div>
               </div>
            </div>
          </div>
          
          {/* Artwork & Mockups */}
          <div>
            <div className="flex items-center justify-between mb-4">
               <h2 className={tokens.typography.h2}>Artwork Files</h2>
               <button className="text-sm font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors">Upload</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
               <div className="aspect-square bg-white border border-brand-border rounded-card p-4 flex flex-col justify-between hover:-translate-y-1 transition-transform cursor-pointer shadow-sm">
                  <div className="h-full bg-brand-muted rounded flex items-center justify-center mb-3 border border-brand-border/50">
                     <ImageIcon className="text-brand-secondary/50" size={32} />
                  </div>
                  <div className="flex justify-between items-center w-full">
                     <span className="text-xs font-medium truncate">Left_Chest_Logo_v2.ai</span>
                     <LinkIcon size={14} className="text-brand-secondary" />
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Activity & Assignees */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Team Assignment */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className={tokens.typography.h3}>Team</h3>
              <button className="text-brand-secondary hover:text-brand-primary"><Users size={16} /></button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2 hover:bg-brand-bg rounded-lg transition-colors cursor-pointer">
                 <div className="w-8 h-8 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center">AG</div>
                 <div>
                    <p className="text-sm font-medium">Anna Garcia</p>
                    <p className="text-xs text-brand-secondary">Production Manager</p>
                 </div>
              </div>
              <div className="flex items-center gap-3 p-2 hover:bg-brand-bg rounded-lg transition-colors cursor-pointer">
                 <div className="w-8 h-8 rounded-full bg-amber-500 text-brand-primary text-xs font-bold flex items-center justify-center">VM</div>
                 <div>
                    <p className="text-sm font-medium">Vanessa Miller</p>
                    <p className="text-xs text-brand-secondary">Printer</p>
                 </div>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm flex flex-col h-[500px]">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="text-brand-primary" size={20} />
              <h3 className={tokens.typography.h3}>Activity</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar mb-4">
               {/* Event */}
               <div className="relative pl-6 border-l border-brand-border/60">
                  <div className="absolute w-2 h-2 rounded-full bg-brand-primary left-[-4.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-brand-primary mb-0.5">Status changed to Printing</p>
                  <p className="text-xs text-brand-secondary">Today, 9:42 AM by Anna G.</p>
               </div>
               
               {/* Comment */}
               <div className="relative pl-6 border-l border-brand-border/60">
                  <div className="absolute w-2 h-2 rounded-full bg-brand-secondary left-[-4.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-brand-primary mb-1">Vanessa Miller</p>
                  <div className="bg-brand-bg p-3 rounded-lg text-sm text-brand-secondary border border-brand-border/50">
                     Screens are burned and set up on press 2. Waiting for shirts to complete receiving.
                  </div>
                  <p className="text-xs text-brand-secondary mt-1">Yesterday, 3:15 PM</p>
               </div>

                {/* Event */}
               <div className="relative pl-6 border-l border-brand-border/60 pb-4">
                  <div className="absolute w-2 h-2 rounded-full bg-blue-500 left-[-4.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-brand-primary mb-0.5">Artwork Approved</p>
                  <p className="text-xs text-brand-secondary">Oct 12, 10:00 AM by Client Portal</p>
               </div>
            </div>

            {/* Comment Input */}
            <div className="mt-auto relative">
               <input 
                 type="text" 
                 placeholder="Leave a note..." 
                 className="w-full bg-brand-bg border border-brand-border rounded-lg pl-4 pr-10 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
               />
               <button className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary transition-colors">
                 <MessageSquare size={16} />
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
