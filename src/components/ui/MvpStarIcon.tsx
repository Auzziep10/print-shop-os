import React from 'react';

interface MvpStarIconProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Clean, geometric, sharp-pointed solid 5-point star (no rounded tips or cartoon stroke).
 * Defaults to solid yellow (`text-yellow-400`).
 */
export const MvpStarIcon: React.FC<MvpStarIconProps> = ({
  size = 16,
  className = 'text-yellow-400',
  title,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    className={`shrink-0 ${className}`}
    aria-label={title || 'VIP'}
  >
    {title && <title>{title}</title>}
    <polygon points="12,1.5 14.9,8.4 22.4,9.1 16.7,14.0 18.4,21.4 12,17.5 5.6,21.4 7.3,14.0 1.6,9.1 9.1,8.4" />
  </svg>
);
