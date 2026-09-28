// src/components/settings/SettingsLanguage.tsx
import type React from 'react';
import { useState, useRef, useEffect } from 'react';

import { t } from '@/i18n';
import type { Setting } from '../../contexts/SettingsContext';
import { useLanguage } from '../../hooks/useLanguage';
import { ChevronUpIcon, ChevronDownIcon } from '../common/Icons';

interface SettingsLanguageProps {
	setting: Setting;
	onLocalUpdate?: (value: unknown) => void;
}

const SettingsLanguage: React.FC<SettingsLanguageProps> = ({
	setting,
	onLocalUpdate,
}) => {
	const { currentLanguage, availableLanguages, changeLanguage } = useLanguage();
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
				setSearchQuery('');
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			searchInputRef.current.focus();
		}
	}, [isOpen]);

	const getCoverageColor = (coverage: number) => {
		if (coverage >= 90) return '#28a745';
		if (coverage >= 70) return '#ffc107';
		return '#dc3545';
	};

	const filteredLanguages = availableLanguages.filter(
		(lang) =>
			lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
			lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			lang.code.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const handleSelect = (code: string) => {
		if (onLocalUpdate) {
			onLocalUpdate(code);
		}
		changeLanguage(code);
		setIsOpen(false);
		setSearchQuery('');
	};

	if (!currentLanguage) return null;

	return (
		<div className='ui-stack' data-gap='lg'>
			<div className='ui-field'>
				<label>{setting.label}</label>
				<div className='ui-menu-anchor' ref={dropdownRef}>
					<button
						type='button'
						className='ui-field-control ui-control-trigger'
						aria-haspopup='listbox'
						aria-expanded={isOpen}
						onClick={() => setIsOpen(!isOpen)}
					>
						<span className='ui-control-content'>
							<span className='ui-control-label'>
								{currentLanguage.nativeName} ({currentLanguage.name})
							</span>
							<span className='ui-actions' data-gap='sm'>
								<progress
									className='ui-progress'
									value={currentLanguage.coverage}
									max={100}
									style={{
										accentColor: getCoverageColor(currentLanguage.coverage),
									}}
								/>
								<span
									className='ui-note'
									style={{ color: getCoverageColor(currentLanguage.coverage) }}
								>
									{currentLanguage.coverage}%
								</span>
							</span>
						</span>
						<span className='ui-icon' data-tone='muted'>
							{isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
						</span>
					</button>

					{isOpen && (
						<div
							className='ui-menu'
							data-layout='column'
							data-position='below'
							role='listbox'
						>
							<div className='ui-menu-search'>
								<input
									ref={searchInputRef}
									type='text'
									placeholder={t('Search languages...')}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className='ui-field-control'
								/>
							</div>
							<div className='ui-menu-scroll'>
								{filteredLanguages.map((lang) => (
									<button
										type='button'
										key={lang.code}
										className='ui-menu-item'
										data-active={
											currentLanguage.code === lang.code ? 'true' : undefined
										}
										role='option'
										aria-selected={currentLanguage.code === lang.code}
										onClick={() => handleSelect(lang.code)}
									>
										<span className='ui-stack' data-gap='xs' data-grow='true'>
											<span className='ui-actions'>
												<span>
													{lang.nativeName} ({lang.name})
												</span>
												<span
													className='ui-note'
													style={{
														marginLeft: 'auto',
														color: getCoverageColor(lang.coverage),
													}}
												>
													{lang.coverage}%
												</span>
											</span>
											<progress
												className='ui-progress'
												value={lang.coverage}
												max={100}
												style={{ accentColor: getCoverageColor(lang.coverage) }}
											/>
											<span className='ui-note'>
												{lang.translatedKeys} / {lang.totalKeys}{' '}
												{t('{count}phrase translated', {
													count: lang.totalKeys,
												})}
											</span>
										</span>
									</button>
								))}
								{filteredLanguages.length === 0 && (
									<div className='ui-empty-state'>
										{t('No languages found')}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
				{setting.description && (
					<div className='ui-note ui-field-hint'>{setting.description}</div>
				)}
			</div>
		</div>
	);
};

export default SettingsLanguage;
