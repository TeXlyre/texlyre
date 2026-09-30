import type React from 'react';

import { t } from '@/i18n';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	ChevronUpIcon,
	ViewIcon,
} from '../common/Icons';

interface OutlineStateToggleProps {
	collapsed: boolean;
	maximized?: boolean;
	threeState?: boolean;
	onToggle: () => void;
}

export const OutlineStateToggle: React.FC<OutlineStateToggleProps> = ({
	collapsed,
	maximized = false,
	threeState = false,
	onToggle,
}) => {
	const title = collapsed
		? t('Expand Outline')
		: threeState && !maximized
			? t('Expand Outline Area')
			: t('Collapse Outline');

	return (
		<button
			type='button'
			className='ui-icon-button'
			data-variant='subtle'
			data-size='xs'
			aria-expanded={!collapsed}
			title={title}
			onClick={onToggle}
		>
			{collapsed ? (
				<ChevronRightIcon />
			) : maximized ? (
				<ChevronUpIcon />
			) : (
				<ChevronDownIcon />
			)}
		</button>
	);
};

interface OutlinePreviewToggleProps {
	enabled: boolean;
	onToggle?: () => void;
}

const OutlinePreviewToggle: React.FC<OutlinePreviewToggleProps> = ({
	enabled,
	onToggle,
}) => {
	if (!onToggle) return null;

	return (
		<button
			type='button'
			className={`ui-icon-button mobile-outline-preview-toggle${enabled ? ' active' : ''}`}
			data-variant='subtle'
			data-size='xs'
			aria-pressed={enabled}
			title={enabled ? t('Hide Editor Preview') : t('Show Editor Preview')}
			onClick={onToggle}
		>
			<ViewIcon />
		</button>
	);
};

export default OutlinePreviewToggle;
