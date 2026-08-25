// src/components/profile/ProfileBrowserStorageSection.tsx
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { t } from '@/i18n';
import {
	type BrowserKey,
	canRequestPersistentStorage,
	detectBrowser,
	detectBrowserAsync,
	getBrowserName,
	isStandaloneApp,
} from '../../utils/browserUtils';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { authService } from '../../services/AuthService';
import {
	type ReclaimableDatabase,
	type ReclaimableKind,
	deleteProjectTypesetterCaches,
	deleteDatabases,
	deleteTypstPackageCache,
	hasProjectTypesetterCache as detectProjectTypesetterCache,
	hasTypstPackageCache,
	listReclaimableDatabases,
} from '../../utils/dbDeleteUtils';
import { formatFileSize } from '../../utils/fileUtils';
import {
	type DetailedStorageSegmentId,
	type DetailedStorageUsageSegment,
	estimateDetailedStorageUsage,
} from '../../utils/storageUsageUtils';
import IconButton from '../common/IconButton';
import InfoTooltip from '../common/InfoTooltip';
import { LockIcon, TrashIcon } from '../common/Icons';

interface BrowserStorageSectionProps {
	isSubmitting: boolean;
	setIsSubmitting: (value: boolean) => void;
	onError: (message: string) => void;
	onSuccess: (message: string) => void;
}

type BrowserStorageHelp = {
	storageUrl: string;
	appUrl?: string;
};

const GENERIC_PWA_HELP_URL =
	'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing#uninstalling';

function storageHelp(storageUrl: string, appUrl?: string): BrowserStorageHelp {
	return appUrl ? { storageUrl, appUrl } : { storageUrl };
}

function pwaStorageHelp(
	storageUrl: string,
	appUrl = GENERIC_PWA_HELP_URL,
): BrowserStorageHelp {
	return { storageUrl, appUrl };
}

const BROWSER_STORAGE_HELP: Record<BrowserKey, BrowserStorageHelp> = {
	brave: pwaStorageHelp(
		'https://support.brave.com/hc/en-us/articles/360048833872-How-Do-I-Clear-Cookies-And-Site-Data-In-Brave',
	),
	edge: pwaStorageHelp(
		'https://support.microsoft.com/en-us/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use',
		'https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux#managing-pwas',
	),
	opera: pwaStorageHelp('https://help.opera.com/en/latest/web-preferences/'),
	vivaldi: pwaStorageHelp(
		'https://help.vivaldi.com/desktop/navigation/history/',
	),
	samsung: pwaStorageHelp(
		'https://www.samsung.com/us/support/answer/ANS10010562/',
	),
	yandex: pwaStorageHelp(
		'https://yandex.com/support/browser/en/personal-data-protection/deleting-data',
	),
	whale: pwaStorageHelp(
		'https://help.whale.naver.com/en/desktop/tips/clearhistory/',
	),
	qq: pwaStorageHelp(
		'https://privacy.tencent.com/document/priview/2491347092a64d7fa00cbc2bf68fbbbb?addressbar=hide',
	),
	uc: pwaStorageHelp(
		'https://img.ucweb.com/s/uae/g/3o/ucwebptc/suit_bu1_uc202007241608_71682_04.html',
	),
	huawei: pwaStorageHelp(
		'https://consumer.huawei.com/uk/support/content/en-gb00706921/',
	),
	xiaomi: pwaStorageHelp(
		'https://trust.mi.com/docs/miui-privacy-white-paper-global/3/3',
	),
	vivo: pwaStorageHelp(
		'https://h5.vivo.com.cn/browser/privacyPolicy/index.html',
	),
	heytap: pwaStorageHelp(
		'https://muc.heytap.com/document/heytap/oversea/privacyPolicy/privacyPolicy_en-US.html?target=_blank',
	),
	coccoc: pwaStorageHelp(
		'https://blog.coccoc.com/cache-la-gi-cach-xoa-cache-tren-trinh-duyet-web-coc-coc/',
	),
	ecosia: pwaStorageHelp(
		'https://support.ecosia.org/article/629-troubleshooting-guide',
	),
	maxthon: pwaStorageHelp('https://www.maxthon.com/en/feature/data-cleaning/'),
	duckduckgo: storageHelp(
		'https://duckduckgo.com/duckduckgo-help-pages/privacy/fire-tabs',
	),
	firefoxFocus: storageHelp(
		'https://www.mozilla.org/en-US/privacy/firefox-focus/',
	),
	firefox: storageHelp(
		'https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox',
	),
	chrome: pwaStorageHelp(
		'https://support.google.com/chrome/answer/95647?hl=en&co=GENIE.Platform%3DDesktop',
		'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&hl=en',
	),
	chromium: pwaStorageHelp(
		'https://support.google.com/chrome/answer/95647?hl=en&co=GENIE.Platform%3DDesktop',
	),
	webkitgtk: pwaStorageHelp(
		'https://help.gnome.org/epiphany/data-personal-data.html',
		'https://help.gnome.org/epiphany/browse-webapps-del.html',
	),
	safari: storageHelp(
		'https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac',
	),
	other: storageHelp(
		'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria',
	),
};

const STORAGE_SEGMENT_LABELS: Record<DetailedStorageSegmentId, string> = {
	'projects-documents': 'Projects and documents',
	'typesetter-cache': 'Typesetter cache',
	'leftover-projects': 'Leftover project data',
	'app-data': 'Account and app data',
	'offline-cache': 'Offline app cache',
	'storage-overhead': 'Browser storage overhead',
	other: 'Other browser data',
};

const STORAGE_SEGMENT_COLORS: Record<DetailedStorageSegmentId, string> = {
	'projects-documents': 'var(--color-storage-projects)',
	'typesetter-cache': 'var(--color-storage-typesetter)',
	'leftover-projects': 'var(--color-storage-leftover)',
	'app-data': 'var(--color-storage-app)',
	'offline-cache': 'var(--color-storage-offline)',
	'storage-overhead': 'var(--color-storage-overhead)',
	other: 'var(--color-storage-other)',
};

function storageSegmentColor(id: string): string | undefined {
	return STORAGE_SEGMENT_COLORS[id as DetailedStorageSegmentId];
}

const BrowserStorageSection: React.FC<BrowserStorageSectionProps> = ({
	isSubmitting,
	setIsSubmitting,
	onError,
	onSuccess,
}) => {
	const {
		isSupported,
		isPersisted,
		isLow,
		usageBytes,
		quotaBytes,
		availableBytes,
		usedRatio,
		segments,
		refresh,
		requestPersistence,
	} = useStorageQuota();

	const [reclaimable, setReclaimable] = useState<ReclaimableDatabase[]>([]);
	const [hasProjectTypesetterCache, setHasProjectTypesetterCache] =
		useState(false);
	const [hasTypstCache, setHasTypstCache] = useState(false);
	const [detailedSegments, setDetailedSegments] = useState<
		DetailedStorageUsageSegment[]
	>([]);
	const [browserKey, setBrowserKey] = useState<BrowserKey>(detectBrowser);
	const isStandalone = isStandaloneApp();
	const persistenceRequestAvailable = canRequestPersistentStorage();
	const canKeepData = isStandalone && persistenceRequestAvailable;
	const browserStorageHelp = BROWSER_STORAGE_HELP[browserKey];
	const browserName = getBrowserName(browserKey);
	const displaySegments =
		detailedSegments.length > 0
			? detailedSegments.map((segment) => ({
					...segment,
					label: t(STORAGE_SEGMENT_LABELS[segment.id]),
				}))
			: segments;

	const scanReclaimable = useCallback(async () => {
		try {
			const projects = await authService.getAllProjects();
			const [databases, projectCache, typstCache, storageSegments] =
				await Promise.all([
					listReclaimableDatabases(projects),
					detectProjectTypesetterCache(projects),
					hasTypstPackageCache(),
					estimateDetailedStorageUsage(projects),
				]);
			setReclaimable(databases);
			setHasProjectTypesetterCache(projectCache);
			setHasTypstCache(typstCache);
			setDetailedSegments(storageSegments);
		} catch (error) {
			setReclaimable([]);
			setHasProjectTypesetterCache(false);
			setHasTypstCache(false);
			setDetailedSegments([]);
			onError(
				error instanceof Error
					? error.message
					: t('Failed to inspect browser storage'),
			);
		}
	}, [onError]);

	useEffect(() => {
		void scanReclaimable();
	}, [scanReclaimable]);

	useEffect(() => {
		let active = true;

		void detectBrowserAsync().then((detectedBrowser) => {
			if (active) setBrowserKey(detectedBrowser);
		});

		return () => {
			active = false;
		};
	}, []);

	const groupOf = (kind: ReclaimableKind) =>
		reclaimable.filter(({ kind: entryKind }) => entryKind === kind);

	const handleClear = async (kind: ReclaimableKind) => {
		try {
			setIsSubmitting(true);
			await deleteDatabases(groupOf(kind).map((entry) => entry.name));
			if (kind === 'typesetter-cache') {
				const projects = await authService.getAllProjects();
				await Promise.all([
					deleteProjectTypesetterCaches(projects),
					deleteTypstPackageCache(),
				]);
			}
			await scanReclaimable();
			await refresh();
			onSuccess(t('Storage cleaned up'));
		} catch (error) {
			onError(
				error instanceof Error ? error.message : t('Failed to free up storage'),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRequestPersistence = async () => {
		const granted = await requestPersistence();
		if (granted) {
			onSuccess(t('Your data is now protected from automatic deletion'));
		} else {
			onError(t('Your browser did not grant protection for this data'));
		}
	};

	const persistenceHelp = !isStandalone
		? t(
				'Install TeXlyre as an app to enable this option. Your projects are still saved locally in this browser.',
			)
		: t(
				'Your browser does not support protecting local data from automatic deletion.',
			);

	const protectedStorageHelp = (
		<>
			<p>
				{t(
					'TeXlyre cannot disable persistent storage after your browser grants it.',
				)}
			</p>
			<p>
				{t('Detected browser:')} <strong>{browserName}</strong>
			</p>
			<p>
				{t(
					'Use your browser settings to clear TeXlyre site data. This deletes local projects and other local TeXlyre data, so export anything you need first.',
				)}
			</p>
			<p>
				<a
					href={browserStorageHelp.storageUrl}
					target='_blank'
					rel='noopener noreferrer'
					className='dropdown-link'
				>
					{t('Open {browser} site-data instructions', {
						browser: browserName,
					})}
				</a>
			</p>
			{isStandalone && browserStorageHelp.appUrl && (
				<p>
					{t(
						'Installed Chromium apps may receive persistent storage again while they remain installed. To fully return to best-effort storage, uninstall the TeXlyre app as well.',
					)}{' '}
					<a
						href={browserStorageHelp.appUrl}
						target='_blank'
						rel='noopener noreferrer'
						className='dropdown-link'
					>
						{t('Open app uninstall instructions')}
					</a>
				</p>
			)}
		</>
	);

	const reclaimableGroups: {
		kind: ReclaimableKind;
		title: string;
		description: string;
	}[] = [
		{
			kind: 'typesetter-cache',
			title: t('Typesetter cache'),
			description: t(
				'SwiftLaTeX, BusyTeX, and Typst packages and compilation cache. They are downloaded or rebuilt again when needed; downloaded packages require an internet connection.',
			),
		},
		{
			kind: 'orphan-project',
			title: t('Leftover project data'),
			description: t(
				'Data left behind by projects that no longer exist on this device.',
			),
		},
	];

	return (
		<>
			<h3 style={{ paddingTop: '1rem' }}>{t('Browser Storage')}</h3>

			{!isSupported ? (
				<p className='storage-notice'>
					{t('Your browser does not report how much storage is available')}
				</p>
			) : (
				<div className='browser-storage-summary'>
					<div className='browser-storage-figures'>
						<span>
							{t('{used} used of about {total}', {
								used: formatFileSize(usageBytes),
								total: formatFileSize(quotaBytes),
							})}
						</span>
						<span>
							{t('{size} left', { size: formatFileSize(availableBytes) })}
						</span>
					</div>

					<div className={`storage-meter ${isLow ? 'low' : ''}`}>
						{displaySegments.length > 0 ? (
							displaySegments.map((segment) => (
								<div
									key={segment.id}
									className={`storage-meter-segment ${segment.id}`}
									style={{
										width: `${quotaBytes > 0 ? (segment.bytes / quotaBytes) * 100 : 0}%`,
										backgroundColor: storageSegmentColor(segment.id),
									}}
								/>
							))
						) : (
							<div
								className='storage-meter-segment indexedDB'
								style={{ width: `${usedRatio * 100}%` }}
							/>
						)}
					</div>

					{displaySegments.length > 0 && (
						<div className='storage-meter-legend'>
							{displaySegments.map((segment) => (
								<span key={segment.id}>
									<i
										className={`storage-meter-key ${segment.id}`}
										style={{
											backgroundColor: storageSegmentColor(segment.id),
										}}
									/>
									{segment.label} {formatFileSize(Math.round(segment.bytes))}
								</span>
							))}
						</div>
					)}

					<div className='browser-storage-persistence'>
						<LockIcon />
						<span>
							{isPersisted
								? t('This data is protected from automatic deletion')
								: t('Your browser may delete this data when space runs low')}
						</span>

						<div
							className='browser-storage-persistence-actions'
							style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
						>
							{isPersisted ? (
								<InfoTooltip
									content={protectedStorageHelp}
									title={t('Storage protection')}
								/>
							) : (
								<>
									<button
										type='button'
										className='button secondary smaller'
										style={{ margin: 0 }}
										onClick={handleRequestPersistence}
										disabled={isSubmitting || !canKeepData}
									>
										{t('Keep my data')}
									</button>
									{!canKeepData && <InfoTooltip content={persistenceHelp} />}
								</>
							)}
						</div>
					</div>
				</div>
			)}

			<div className='local-storage-actions'>
				<div className='storage-action-group'>
					<div className='storage-action-info'>
						<strong>
							{t('Browser: ')} {browserName}
						</strong>
						<p>{t('Manage or delete TeXlyre data stored by this browser.')}</p>
						<a
							href={browserStorageHelp.storageUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='dropdown-link'
						>
							{t('Learn more about managing site data in {browser}', {
								browser: browserName,
							})}
						</a>
						{isStandalone && browserStorageHelp.appUrl && (
							<>
								{' · '}
								<a
									href={browserStorageHelp.appUrl}
									target='_blank'
									rel='noopener noreferrer'
									className='dropdown-link'
								>
									{t('Learn more about installed apps in {browser}', {
										browser: browserName,
									})}
								</a>
							</>
						)}
					</div>
				</div>

				{reclaimableGroups.map((group) => {
					const entries = groupOf(group.kind);
					const canClear =
						entries.length > 0 ||
						(group.kind === 'typesetter-cache' &&
							(hasProjectTypesetterCache || hasTypstCache));

					return (
						<div className='storage-action-group' key={group.kind}>
							<div className='storage-action-info'>
								<strong>{group.title}</strong>
								<p>{group.description}</p>
							</div>
							<div className='storage-action-buttons'>
								<IconButton
									icon={<TrashIcon />}
									label={t('Clear {name}', { name: group.title })}
									tooltip={canClear ? group.description : t('Nothing to clear')}
									variant='danger'
									disabled={isSubmitting || !canClear}
									confirm={{
										title: group.title,
										message: group.description,
										confirmLabel: t('Clear'),
									}}
									onClick={() => void handleClear(group.kind)}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
};

export default BrowserStorageSection;
