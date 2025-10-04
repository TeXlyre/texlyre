// src/components/settings/SettingsButton.tsx
import type React from 'react';
import { useState } from 'react';
import { SettingsIcon } from '../common/Icons';
import SettingsModal from './SettingsModal';

interface SettingsButtonProps {
	className?: string;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({ className = '' }) => {
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	return (
		<>
			<button
				className={`settings-button ${className}`}
				onClick={() => setIsSettingsOpen(true)}
				title="Settings"
			>
				<SettingsIcon />
			</button>
			<SettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
			/>
		</>
	);
};

export default SettingsButton;
