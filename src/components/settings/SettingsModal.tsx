// src/components/settings/SettingsModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../../hooks/useSettings';
import { DEFERRED_UPDATE_TYPES } from '../../contexts/SettingsContext';
import type { Setting } from '../../contexts/SettingsContext';
import { SettingsIcon } from '../common/Icons';
import Modal from '../common/Modal';
import SettingControl from './SettingControl';

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	initialCategory?: string;
	initialSubcategory?: string;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
	isOpen,
	onClose,
	initialCategory,
	initialSubcategory,
}) => {
	const {
		getCategories,
		getSettingsByCategory,
		searchSettings,
		hasUnsavedChanges,
		needsRefresh,
		updateSetting,
	} = useSettings();

	const [searchQuery, setSearchQuery] = useState('');
	const [filteredData, setFilteredData] = useState<{
		categories: { category: string; subcategories: string[] }[];
		allSettings: any[];
	}>({ categories: [], allSettings: [] });

	const [activeCategory, setActiveCategory] = useState('');
	const [activeSubcategory, setActiveSubcategory] = useState<
		string | undefined
	>();
	const [pendingValues, setPendingValues] = useState<Record<string, unknown>>(
		{},
	);
	const hasPendingChanges = Object.keys(pendingValues).length > 0;

	const isDeferred = (setting: Setting) =>
		setting.liveUpdate === false ||
		(setting.liveUpdate === undefined &&
			DEFERRED_UPDATE_TYPES.includes(setting.type));

	useEffect(() => {
		const result = searchSettings(searchQuery);
		setFilteredData(result);

		if (result.categories.length === 0) return;

		if (
			!activeCategory &&
			initialCategory &&
			result.categories.some((c) => c.category === initialCategory)
		) {
			setActiveCategory(initialCategory);
			const targetCategory = result.categories.find(
				(c) => c.category === initialCategory,
			);
			if (targetCategory) {
				const targetSub =
					initialSubcategory &&
					targetCategory.subcategories.includes(initialSubcategory)
						? initialSubcategory
						: targetCategory.subcategories[0];
				setActiveSubcategory(targetSub);
			}
			return;
		}

		if (!result.categories.some((c) => c.category === activeCategory)) {
			setActiveCategory(result.categories[0].category);
			setActiveSubcategory(result.categories[0].subcategories[0]);
		} else if (activeSubcategory) {
			const currentCategory = result.categories.find(
				(c) => c.category === activeCategory,
			);
			if (
				currentCategory &&
				!currentCategory.subcategories.includes(activeSubcategory)
			) {
				setActiveSubcategory(currentCategory.subcategories[0]);
			}
		}
	}, [
		searchQuery,
		initialCategory,
		initialSubcategory,
		activeCategory,
		activeSubcategory,
		getCategories,
		searchSettings,
	]);

	useEffect(() => {
		if (isOpen) {
			setActiveCategory(initialCategory || '');
			setActiveSubcategory(initialSubcategory);
		}
	}, [isOpen, initialCategory, initialSubcategory]);

	const handleLocalUpdate = (
		settingId: string,
		value: unknown,
		setting: Setting,
	) => {
		if (isDeferred(setting)) {
			setPendingValues((prev) => ({ ...prev, [settingId]: value }));
		} else {
			updateSetting(settingId, value);
		}
	};

	const handleSaveChanges = () => {
		Object.entries(pendingValues).forEach(([id, value]) => {
			updateSetting(id, value);
		});
		setPendingValues({});
	};

	const getDisplayValue = (setting: Setting) => {
		if (pendingValues[setting.id] !== undefined) {
			return pendingValues[setting.id];
		}
		return setting.value !== undefined ? setting.value : setting.defaultValue;
	};

	const highlightText = (text: string, query: string) => {
		if (!query.trim()) return text;

		const regex = new RegExp(
			`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
			'gi',
		);
		const parts = text.split(regex);

		return parts.map((part, index) =>
			regex.test(part) ? (
				<mark key={index} className='search-highlight'>
					{part}
				</mark>
			) : (
				part
			),
		);
	};

	const renderTitle = () => {
		if (!searchQuery) {
			return `${activeCategory}${activeSubcategory ? ` - ${activeSubcategory}` : ''}`;
		}

		return (
			<>
				{highlightText(activeCategory, searchQuery)}
				{activeSubcategory && (
					<>
						{' - '}
						{highlightText(activeSubcategory, searchQuery)}
					</>
				)}
			</>
		);
	};

	const settings = getSettingsByCategory(activeCategory, activeSubcategory);

	if (filteredData.categories.length === 0 && !searchQuery) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('Settings')}
				size='large'
			>
				<div className='settings-empty-state'>
					<p>{t('No settings are currently available.')}</p>
				</div>
			</Modal>
		);
	}

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Settings')}
			icon={SettingsIcon}
			size='large'
		>
			<div className='settings-wrapper'>
				{hasPendingChanges && (
					<div className='pending-changes-bar warning-message'>
						<span>
							{t('You have unsaved changes that require page refresh')}
						</span>
						<button className='button primary' onClick={handleSaveChanges}>
							{t('Save Changes')}
						</button>
					</div>
				)}
				<div className='settings-container'>
					<div className='settings-sidebar'>
						<div className='settings-search'>
							<input
								type='text'
								placeholder={t('Search settings...')}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className='search-input'
							/>
							{searchQuery && (
								<button
									aria-label={t('Clear search')}
									className='clear-search-button'
									onClick={() => setSearchQuery('')}
									title={t('Clear search')}
								>
									<span aria-hidden='true'>×</span>
								</button>
							)}
						</div>
						{filteredData.categories.map(({ category, subcategories }) => (
							<div key={category} className='settings-category'>
								<div
									className={`category-item ${activeCategory === category ? 'active' : ''}`}
									onClick={() => {
										setActiveCategory(category);
										setActiveSubcategory(subcategories[0]);
									}}
								>
									{highlightText(category, searchQuery)}
								</div>
								{activeCategory === category && subcategories.length > 0 && (
									<div className='subcategories'>
										{subcategories.map((subcategory) => (
											<div
												key={subcategory}
												className={`subcategory-item ${activeSubcategory === subcategory ? 'active' : ''}`}
												onClick={() => setActiveSubcategory(subcategory)}
											>
												{highlightText(subcategory, searchQuery)}
											</div>
										))}
									</div>
								)}
							</div>
						))}

						{filteredData.categories.length === 0 && searchQuery && (
							<div className='no-results'>
								{t('No settings found matching "')}
								{searchQuery}"
							</div>
						)}
					</div>

					<div className='settings-content'>
						<h3>{renderTitle()}</h3>
						<div className='settings-group'>
							{settings.map((setting) => (
								<div key={setting.id} className='setting-with-highlight'>
									<SettingControl
										setting={{
											...setting,
											value: getDisplayValue(setting),
											label: searchQuery
												? (highlightText(setting.label, searchQuery) as string)
												: setting.label,
											description: (typeof setting.description === 'string' &&
											searchQuery
												? (highlightText(
														setting.description,
														searchQuery,
													) as string)
												: setting.description) as string,
										}}
										onLocalUpdate={(value) =>
											handleLocalUpdate(setting.id, value, setting)
										}
									/>
								</div>
							))}
							{settings.length === 0 && (
								<div className='no-settings'>
									{t('No settings available in this category.')}
								</div>
							)}
						</div>
					</div>

					{hasUnsavedChanges && (
						<div className='save-indicator'>{t('Settings Saved')}</div>
					)}
					{needsRefresh && !hasPendingChanges && (
						<div className='refresh-indicator'>
							{t('Page refresh required')}
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
};

export default SettingsModal;
