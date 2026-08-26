// src/settings/registerSharedToolsSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';
import {
	EMPTY_SHARED_TOOL_PREFERENCES,
	SHARED_TOOL_PREFERENCES_SETTING,
	normalizeSharedToolPreferences,
} from '../utils/sharedToolsUtils';

export function useRegisterSharedToolSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const stored = batchGetSettings([SHARED_TOOL_PREFERENCES_SETTING])[
			SHARED_TOOL_PREFERENCES_SETTING
		];

		registerSetting({
			id: SHARED_TOOL_PREFERENCES_SETTING,
			category: t('External Tools'),
			type: 'custom',
			label: t('Shared Tool Preferences'),
			defaultValue: stored
				? normalizeSharedToolPreferences(stored)
				: EMPTY_SHARED_TOOL_PREFERENCES,
			liveUpdate: true,
			hidden: true,
		});
	}, [registerSetting, batchGetSettings]);
}
