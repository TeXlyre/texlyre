// src/settings/registerTypesetterConfigSettings.tsx
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterTypesetterConfigSettings() {
    const { registerSetting, batchGetSettings } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const batchedSettings = batchGetSettings(['generic-typesetter-configs']);
        const settingValue = batchedSettings['generic-typesetter-configs'];

        let storedValue: string | unknown[] = '[]';

        if (typeof settingValue === 'string') {
            storedValue = settingValue;
        } else if (Array.isArray(settingValue)) {
            storedValue = settingValue;
        }

        registerSetting({
            id: 'generic-typesetter-configs',
            category: t('External Tools'),
            subcategory: t('Generic Typesetter'),
            type: 'codemirror',
            label: t('Typesetter Configurations'),
            description: t('Stored remote typesetter configurations (JSON array)'),
            defaultValue: storedValue,
            liveUpdate: false,
        });
    }, [registerSetting, batchGetSettings]);
}
