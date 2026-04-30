// src/components/output/PopoutViewerToggleButton.tsx
import React, { useEffect, useState } from 'react';

import { popoutViewerService } from '../../services/PopoutViewerService';
import { ExternalLinkIcon } from '../common/Icons';

interface PopoutViewerToggleButtonProps {
	className?: string;
	projectId: string;
	title?: string;
}

const PopoutViewerToggleButton: React.FC<PopoutViewerToggleButtonProps> = ({
	className = '',
	projectId,
	title = 'Open in new window',
}) => {
	const [isWindowOpen, setIsWindowOpen] = useState(false);

	useEffect(() => {
		popoutViewerService.initialize(projectId);

		const unsubscribe = popoutViewerService.addListener((message) => {
			if (message.type === 'window-closed') setIsWindowOpen(false);
			else if (message.type === 'window-ready') setIsWindowOpen(true);
		});

		setIsWindowOpen(popoutViewerService.isWindowOpen());

		return () => {
			unsubscribe();
		};
	}, [projectId]);

	const handleToggle = () => {
		if (isWindowOpen) {
			popoutViewerService.closeWindow();
			setIsWindowOpen(false);
		} else if (popoutViewerService.openWindow()) {
			setIsWindowOpen(true);
		}
	};

	return (
		<button
			className={`latex-button popout-viewer-toggle ${className} ${isWindowOpen ? 'active' : ''}`}
			onClick={handleToggle}
			title={title}
		>
			<ExternalLinkIcon />
		</button>
	);
};

export default PopoutViewerToggleButton;