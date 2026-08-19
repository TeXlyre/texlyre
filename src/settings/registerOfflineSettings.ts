// src/settings/registerOfflineSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterOfflineSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const batchedSettings = batchGetSettings([
			'offline-force-app-offline',
			'offline-airgap-external-requests',
			'offline-force-collab-offline',
			'offline-hide-banner',
			'status-page-url',
			'status-json-url',
		]);

		const initialForceAppOffline =
			(batchedSettings['offline-force-app-offline'] as boolean) ?? false;

		const initialAirgapOffline =
			(batchedSettings['offline-airgap-external-requests'] as boolean) ?? false;

		const initialForceCollabOffline =
			(batchedSettings['offline-force-collab-offline'] as boolean) ?? false;

		const initialHideOfflineBanner =
			(batchedSettings['offline-hide-banner'] as boolean) ?? false;

		registerSetting({
			id: 'offline-force-app-offline',
			category: t('Connectivity'),
			subcategory: t('Offline Mode'),
			type: 'checkbox',
			label: t('Force app offline'),
			description: t(
				'Make the app behave as offline even when the browser is online',
			),
			defaultValue: initialForceAppOffline,
			liveUpdate: false,
		});

		registerSetting({
			id: 'offline-airgap-external-requests',
			category: t('Connectivity'),
			subcategory: t('Offline Mode'),
			type: 'checkbox',
			label: t('Air-gap collaboration and remote preview content'),
			description: t(
				'Air-gap collaboration and preview-only external content by treating them as offline. Repository connections, backups, and TeXlyre CDN resources can still be used. External media references in SVG output, such as videos or audio, will be removed.',
			),
			defaultValue: initialAirgapOffline,
			liveUpdate: false,
		});

		registerSetting({
			id: 'offline-force-collab-offline',
			category: t('Connectivity'),
			subcategory: t('Offline Mode'),
			type: 'checkbox',
			label: t('Force collaboration offline'),
			description: t(
				'Use local Yjs documents without connecting to WebRTC or WebSocket providers',
			),
			defaultValue: initialForceCollabOffline,
			liveUpdate: false,
		});

		registerSetting({
			id: 'offline-hide-banner',
			category: t('Connectivity'),
			subcategory: t('Offline Mode'),
			type: 'checkbox',
			label: t('Hide offline banner'),
			description: t(
				'Hide the offline warning banner while keeping offline behavior enabled',
			),
			defaultValue: initialHideOfflineBanner,
		});

		registerSetting({
			id: 'status-page-url',
			category: t('Connectivity'),
			subcategory: t('Service Status'),
			type: 'text',
			label: t('Status page URL'),
			description: t(
				'Link to the service status page. Leave empty to hide status links and warnings',
			),
			defaultValue: (batchedSettings['status-page-url'] as string) ?? '',
		});

		registerSetting({
			id: 'status-json-url',
			category: t('Connectivity'),
			subcategory: t('Service Status'),
			type: 'text',
			label: t('Status JSON URL'),
			description: t('Status endpoint used to warn about service outages'),
			defaultValue: (batchedSettings['status-json-url'] as string) ?? '',
		});
	}, [registerSetting, batchGetSettings]);
}
