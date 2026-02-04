// extras/viewers/drawio/Icon.tsx
import type React from 'react';

export const DrawioIcon: React.FC = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8" cy="8" r="2" />
        <circle cx="16" cy="8" r="2" />
        <circle cx="8" cy="16" r="2" />
        <circle cx="16" cy="16" r="2" />
        <line x1="10" y1="8" x2="14" y2="8" />
        <line x1="8" y1="10" x2="8" y2="14" />
        <line x1="16" y1="10" x2="16" y2="14" />
        <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
);