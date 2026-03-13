import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, Mail, Phone, MapPin, Building2, ExternalLink, ShieldAlert, FileText, Plus } from 'lucide-react';

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate('/customers')}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Customers
        </button>
        <div className="flex items-center gap-3">
          <PillButton 
            variant="outline" 
            className="gap-2"
            onClick={() => window.open('/portal', '_blank')}
          >
            <ExternalLink size={16} />
            Login to Client Portal
          </PillButton>
          <PillButton variant="filled">
            Edit Company
          </PillButton>
        </div>
      </div>

      {/* Header Profile */}
      <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm mb-8 flex flex-col md:flex-row gap-8 items-start justify-between">
         <div className="flex items-start gap-6">
            <div className="w-24 h-24 rounded-xl border border-brand-border bg-brand-bg flex items-center justify-center text-brand-secondary flex-shrink-0">
               <Building2 size={40} strokeWidth={1} />
            </div>
            <div>
               <div className="flex items-center gap-3 mb-2">
                 <h1 className="font-serif text-4xl text-brand-primary">Wayne Enterprises</h1>
                 <span className="text-[10px] bg-brand-bg border border-brand-border px-2 py-0.5 rounded text-brand-secondary font-semibold uppercase tracking-wider">{id}</span>
               </div>
               <div className="flex items-center gap-4 text-sm text-brand-secondary mb-4">
                  <span className="flex items-center gap-1.5"><MapPin size={14} /> Gotham City, NJ</span>
                  <span className="flex items-center gap-1.5"><Phone size={14} /> (555) 019-8384</span>
                  <span className="flex items-center gap-1.5"><Mail size={14} /> billing@wayne.ent</span>
               </div>
               <div className="flex gap-2">
                 <span className="text-[10px] bg-brand-bg border border-brand-border px-2.5 py-1 rounded-md text-brand-secondary font-semibold uppercase tracking-wider">B2B Corp</span>
                 <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">Net 30 Terms</span>
               </div>
            </div>
         </div>
         <div className="flex gap-8 text-right bg-brand-bg/50 p-6 rounded-2xl border border-brand-border border-dashed">
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Total Orders</p>
               <p className="font-serif text-3xl">42</p>
            </div>
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Lifetime Value</p>
               <p className="font-serif text-3xl">$45,200</p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Contacts & Access */}
        <div className="space-y-8">
          
          {/* Company Logins */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-6">
               <h2 className={tokens.typography.h2}>Portal Access</h2>
               <button className="text-brand-secondary hover:text-brand-primary transition-colors"><Plus size={18} /></button>
            </div>
            <p className="text-sm text-brand-secondary mb-4 leading-relaxed">
              These contacts have active logins mapped to this company's client portal.
            </p>
            
            <div className="space-y-3">
              {[
                 { name: 'Bruce Wayne', role: 'Owner / Admin', email: 'bruce@wayne.ent', lastLogin: 'Today' },
                 { name: 'Lucius Fox', role: 'Purchasing', email: 'lfox@wayne.ent', lastLogin: '3 days ago' },
                 { name: 'Alfred P.', role: 'Accountant', email: 'billing@wayne.ent', lastLogin: 'Oct 12' }
              ].map((contact, i) => (
                <div key={i} className="p-3 border border-brand-border/60 rounded-xl bg-brand-bg flex items-center justify-between group cursor-pointer hover:border-brand-primary/30 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-primary">
                        {contact.name.charAt(0)}
                      </div>
                      <div>
                         <p className="text-sm font-medium text-brand-primary">{contact.name}</p>
                         <p className="text-[10px] text-brand-secondary uppercase tracking-wide font-semibold mt-0.5">{contact.role}</p>
                      </div>
                   </div>
                   <div className="text-right">
                     <p className="text-xs text-brand-secondary">{contact.email}</p>
                     <p className="text-[10px] text-brand-secondary/60 mt-1">Logged in {contact.lastLogin}</p>
                   </div>
                </div>
              ))}
            </div>
          </div>

          {/* CRM Notes */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm">
             <div className="flex items-center gap-2 mb-4">
                <FileText size={18} className="text-brand-secondary" />
                <h3 className={tokens.typography.h3}>Internal Notes</h3>
             </div>
             <textarea 
                className="w-full h-32 bg-brand-bg border border-brand-border rounded-xl p-3 text-sm resize-none focus:border-brand-primary focus:outline-none transition-colors"
                placeholder="Add a note about this company..."
                defaultValue="Always triple check the black ink opacity on their orders. They are very particular about the 'Vanta Black' look."
             ></textarea>
             <div className="mt-3 flex justify-end">
                <button className="text-xs font-semibold px-4 py-2 bg-brand-primary text-white rounded-lg">Save Note</button>
             </div>
          </div>

        </div>

        {/* Right Column: Order History */}
        <div className="lg:col-span-2 space-y-8">
          
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <div>
                   <h2 className={tokens.typography.h2}>Active Quotes & Orders</h2>
                   <p className="text-sm text-brand-secondary mt-1">Current pipeline for this company.</p>
                </div>
                <button className="text-sm font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors">View All History</button>
             </div>

             <div className="border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border">
                {[
                   { id: 'ORD-103', title: '250x Event Polos', status: 'Production', date: 'Due Oct 29', amount: '$4,500.00' },
                   { id: 'QT-892', title: 'Q4 Retreat Swag Boxes', status: 'Pending Approval', date: 'Sent Oct 22', amount: '$12,000.00' },
                ].map((item, i) => (
                   <div key={i} className="flex items-center justify-between p-4 hover:bg-brand-bg transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded border border-brand-border bg-white flex items-center justify-center text-xs font-bold text-brand-secondary group-hover:text-brand-primary transition-colors">
                           {item.id.split('-')[1]}
                         </div>
                         <div>
                            <div className="flex items-center gap-2 mb-1">
                               <p className="font-serif text-lg leading-none">{item.title}</p>
                               <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest ${item.status === 'Production' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {item.status}
                               </span>
                            </div>
                            <p className="text-xs text-brand-secondary">{item.date}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="font-serif text-lg">{item.amount}</p>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          
          {/* Resale Certificate / Tax Exemption Warning */}
          <div className="bg-amber-50 border border-amber-200/50 rounded-card p-6 flex gap-4">
             <ShieldAlert className="text-amber-500 shrink-0" />
             <div>
                <h3 className="font-semibold text-amber-800 mb-1">Tax Exemption Expiring Soon</h3>
                <p className="text-sm text-amber-700/80 mb-3">Wayne Enterprises resale certificate is set to expire in 30 days. They will be charged tax on future invoices if not updated.</p>
                <button className="text-xs font-bold text-amber-800 uppercase tracking-widest hover:underline">Request Update</button>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
