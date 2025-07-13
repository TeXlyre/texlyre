// extras/viewers/image/Icon.tsx
import type React from "react";

export const ImageIcon: React.FC = () => (
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
		<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
		<circle cx="9" cy="9" r="2" />
		<path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
	</svg>
);