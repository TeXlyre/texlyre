// src/components/pdf/PdfWindowToggleButton.tsx
import React, { useEffect, useState } from "react";

import { pdfWindowService } from "../../services/PdfWindowService";
import { ExternalLinkIcon } from "../common/Icons";

interface PdfWindowToggleButtonProps {
	className?: string;
	projectId: string;
	title?: string;
}

const PdfWindowToggleButton: React.FC<PdfWindowToggleButtonProps> = ({
	className = "",
	projectId,
	title = "Open PDF in new window"
}) => {
	const [isWindowOpen, setIsWindowOpen] = useState(false);

	useEffect(() => {
		pdfWindowService.initialize(projectId);

		const unsubscribe = pdfWindowService.addListener((message) => {
			if (message.type === 'window-closed') {
				setIsWindowOpen(false);
			} else if (message.type === 'window-ready') {
				setIsWindowOpen(true);
			}
		});

		setIsWindowOpen(pdfWindowService.isWindowOpen());

		return () => {
			unsubscribe();
		};
	}, [projectId]);

	const handleToggle = () => {
		if (isWindowOpen) {
			pdfWindowService.closeWindow();
			setIsWindowOpen(false);
		} else {
			const success = pdfWindowService.openPdfWindow();
			if (success) {
				setIsWindowOpen(true);
			}
		}
	};

	return (
		<button
			className={`latex-button pdf-window-toggle ${className} ${isWindowOpen ? 'active' : ''}`}
			onClick={handleToggle}
			title={title}
		>
			<ExternalLinkIcon />
		</button>
	);
};

export default PdfWindowToggleButton;