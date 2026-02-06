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
        strokeLinejoin="round"
    >
        <rect x="9" y="3" width="6" height="6" rx="1.5" />
        <rect x="3" y="15" width="6" height="6" rx="1.5" />
        <rect x="15" y="15" width="6" height="6" rx="1.5" />
        <line x1="12" y1="9" x2="6" y2="15" />
        <line x1="12" y1="9" x2="18" y2="15" />
    </svg>
);
