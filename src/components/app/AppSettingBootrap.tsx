// src/components/app/AppSettingBootstrap.tsx
import type React from 'react';

import { useRegisterLanguageSettings } from '../../settings/registerLocaleSettings';
import { useRegisterThemeSettings } from '../../settings/registerThemeSettings';
import { useRegisterEditorSettings } from '../../settings/registerEditorSettings';
import { useRegisterLanguageFeatureSettings } from '../../settings/registerLanguageFeatureSettings';
import { useRegisterCollabSettings } from '../../settings/registerCollabSettings';
import { useRegisterContentFormatterSettings } from '../../settings/registerContentFormatterSettings';
import { useRegisterFileSyncSettings } from '../../settings/registerFileSyncSettings';
import { useRegisterFileSystemBackupSettings } from '../../settings/registerFileSystemBackupSettings';
import { useRegisterFileTreeSettings } from '../../settings/registerFileTreeSettings';
import { useRegisterLatexSettings } from '../../settings/registerLatexSettings';
import { useRegisterTypstSettings } from '../../settings/registerTypstSettings';
import { useRegisterLSPConfigSettings } from '../../settings/registerLSPConfigSettings';
import { useRegisterSharedToolSettings } from '../../settings/registerSharedToolSettings';
import { useRegisterTypesetterConfigSettings } from '../../settings/registerTypesetterConfigSettings';
import { useRegisterOfflineSettings } from '../../settings/registerOfflineSettings';
import { useRegisterStorageSettings } from '../../settings/registerStorageSettings';

const AppBootstrap: React.FC = () => {
	useRegisterEditorSettings();
	useRegisterLanguageFeatureSettings();
	useRegisterCollabSettings();
	useRegisterContentFormatterSettings();
	useRegisterFileSyncSettings();
	useRegisterFileSystemBackupSettings();
	useRegisterFileTreeSettings();
	useRegisterLatexSettings();
	useRegisterTypstSettings();
	useRegisterLSPConfigSettings();
	useRegisterTypesetterConfigSettings();
	useRegisterSharedToolSettings();
	useRegisterLanguageSettings();
	useRegisterThemeSettings();
	useRegisterOfflineSettings();
	useRegisterStorageSettings();
	return null;
};

export default AppBootstrap;
