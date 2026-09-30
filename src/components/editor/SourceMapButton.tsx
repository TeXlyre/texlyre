import type React from 'react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import PositionedDropdown from '../common/PositionedDropdown';
import { useSourceMap } from '../../hooks/useSourceMap';
import { LocateIcon, ChevronDownIcon } from '../common/Icons';
import type { SourceMapClickMode } from '../../types/sourceMap';

interface SourceMapButtonProps {
	className?: string;
	onForwardSync: () => void;
	disabled?: boolean;
}

const CLICK_MODE_OPTIONS: { label: string; value: SourceMapClickMode }[] = [
	{ label: t('Single'), value: 'single' },
	{ label: t('Double'), value: 'double' },
	{ label: t('Triple'), value: 'triple' },
];

const SourceMapButton: React.FC<SourceMapButtonProps> = ({
	className = '',
	onForwardSync,
	disabled = false,
}) => {
	const {
		isAvailable,
		reverseClickMode,
		forwardClickMode,
		showFloatingButtons,
		reverseClickEnabled,
		forwardClickEnabled,
		updateReverseClickMode,
		updateForwardClickMode,
		updateShowFloatingButtons,
		updateReverseClickEnabled,
		updateForwardClickEnabled,
	} = useSourceMap();

	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const isDisabled = disabled || !isAvailable;

	return (
		<div
			className={`ui-control-cluster sourcemap-control ${className}`}
			ref={dropdownRef}
		>
			<div
				className='ui-button-group ui-split-button'
				data-role='plugin-control'
				data-trigger-group='true'
			>
				<button
					type='button'
					className='button ui-split-main'
					onClick={onForwardSync}
					disabled={isDisabled}
					title={t('Jump to location in output (SyncTeX)')}
				>
					<LocateIcon />
				</button>
				<button
					type='button'
					className='button ui-split-toggle dropdown-toggle'
					onClick={(e) => {
						e.stopPropagation();
						setIsDropdownOpen(!isDropdownOpen);
					}}
					disabled={isDisabled}
					title={t('SyncTeX Options')}
				>
					<ChevronDownIcon />
				</button>
			</div>

			<PositionedDropdown
				isOpen={isDropdownOpen && !isDisabled}
				triggerElement={
					dropdownRef.current?.querySelector(
						'[data-trigger-group]',
					) as HTMLElement
				}
				className='sourcemap-dropdown'
				onClose={() => setIsDropdownOpen(false)}
			>
				<div className='ui-menu-section' data-gap='xs'>
					<div className='ui-menu-title sourcemap-dropdown-label'>
						{t('Output click (reverse sync)')}
					</div>
					<div className='ui-menu-section' data-variant='control'>
						<label>
							<input
								type='checkbox'
								checked={reverseClickEnabled}
								onChange={(e) => updateReverseClickEnabled(e.target.checked)}
							/>
							{t('Enable click navigation')}
						</label>
					</div>
					{reverseClickEnabled && (
						<div className='sourcemap-click-mode-group'>
							{CLICK_MODE_OPTIONS.map((opt) => (
								<button
									type='button'
									key={opt.value}
									className={`button sourcemap-click-mode-btn${reverseClickMode === opt.value ? ' active' : ''}`}
									onClick={() => updateReverseClickMode(opt.value)}
								>
									{opt.label}
								</button>
							))}
						</div>
					)}
				</div>

				<div className='ui-menu-divider sourcemap-dropdown-divider' />

				<div className='ui-menu-section' data-gap='xs'>
					<div className='ui-menu-title sourcemap-dropdown-label'>
						{t('Editor click (forward sync)')}
					</div>
					<div className='ui-menu-section' data-variant='control'>
						<label>
							<input
								type='checkbox'
								checked={forwardClickEnabled}
								onChange={(e) => updateForwardClickEnabled(e.target.checked)}
							/>
							{t('Enable click navigation')}
						</label>
					</div>
					{forwardClickEnabled && (
						<div className='sourcemap-click-mode-group'>
							{CLICK_MODE_OPTIONS.map((opt) => (
								<button
									type='button'
									key={opt.value}
									className={`button sourcemap-click-mode-btn${forwardClickMode === opt.value ? ' active' : ''}`}
									onClick={() => updateForwardClickMode(opt.value)}
								>
									{opt.label}
								</button>
							))}
						</div>
					)}
				</div>

				<div className='ui-menu-divider sourcemap-dropdown-divider' />

				<div className='ui-menu-section' data-gap='xs'>
					<div className='ui-menu-section' data-variant='control'>
						<label>
							<input
								type='checkbox'
								checked={showFloatingButtons}
								onChange={(e) => updateShowFloatingButtons(e.target.checked)}
							/>
							{t('Show floating navigation button')}
						</label>
					</div>
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default SourceMapButton;
