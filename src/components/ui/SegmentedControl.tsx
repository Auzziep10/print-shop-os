import { cn } from '../../lib/utils';

export interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  className?: string;
}

export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  return (
    <div className={cn("inline-flex items-center gap-1 border border-brand-border rounded-pill p-1 bg-white", className)}>
      {options.map((opt) => {
        const isActive = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-pill transition-colors whitespace-nowrap",
              isActive 
                ? "bg-brand-primary text-white shadow-sm" 
                : "text-brand-secondary hover:bg-brand-bg hover:text-brand-primary"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
