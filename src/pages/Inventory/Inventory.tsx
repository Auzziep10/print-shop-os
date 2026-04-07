import { tokens } from '../../lib/tokens';

export function Inventory() {
  return (
    <div className={tokens.layout.container}>
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6"}>
        <div>
          <h1 className={tokens.typography.h1}>Inventory Management</h1>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Track stock levels, blanks, and supplies.
          </p>
        </div>
      </div>
      
      <div className="mt-8">
        <div className="bg-white rounded-card border border-brand-border p-8 text-center shadow-sm">
          <p className="text-brand-secondary italic">Inventory management system is actively being structured...</p>
        </div>
      </div>
    </div>
  );
}
