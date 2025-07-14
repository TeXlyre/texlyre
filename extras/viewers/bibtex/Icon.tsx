// extras/viewers/bibtex/Icon.tsx
import type React from "react";

export const BibIcon: React.FC = () => (
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
       <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
       <polyline points="14 2 14 8 20 8" />
       <text x="12" y="18" textAnchor="middle" fontSize="18" fontWeight="10" strokeWidth="1.1" fill="none">"„</text>
    </svg>
);