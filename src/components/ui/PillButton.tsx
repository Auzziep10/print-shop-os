import React from 'react';
import { cn } from '../../lib/utils';
import { tokens } from '../../lib/tokens';

export interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'filled' | 'outline';
    active?: boolean;
}

export const PillButton = React.forwardRef<HTMLButtonElement, PillButtonProps>(
    ({ className, variant = 'outline', active, children, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    tokens.components.pillButton.base,
                    // If active is true, we force the 'filled' look
                    (variant === 'filled' || active)
                        ? tokens.components.pillButton.filled
                        : tokens.components.pillButton.outline,
                    className
                )}
                {...props}
            >
                {children}
            </button>
        );
    }
);
PillButton.displayName = 'PillButton';
