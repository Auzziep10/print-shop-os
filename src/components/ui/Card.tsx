import React from 'react';
import { cn } from '../../lib/utils';
import { tokens } from '../../lib/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(tokens.components.card, className)}
                {...props}
            >
                {children}
            </div>
        );
    }
);
Card.displayName = 'Card';
