// src/components/app/LoadingScreen.tsx
import type React from "react";

const LoadingScreen: React.FC = () => {
	return (
		<div className="loading-container">
			<div className="loading-spinner" />
			<p>Loading TeXlyre...</p>
		</div>
	);
};

export default LoadingScreen;
