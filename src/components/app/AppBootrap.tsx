import type React from 'react';

import { useRegisterEditorSettings } from '../../settings/registerEditorSettings';
import { useRegisterCollabSettings } from '../../settings/registerCollabSettings';
import { useRegisterContentFormatterSettings } from '../../settings/registerContentFormatterSettings';
import { useRegisterFileSyncSettings } from '../../settings/registerFileSyncSettings';
import { useRegisterFileSystemBackupSettings } from '../../settings/registerFileSystemBackupSettings';
import { useRegisterFileTreeSettings } from '../../settings/registerFileTreeSettings';
import { useRegisterLanguageSettings } from '../../settings/registerLanguageSettings';
import { useRegisterLatexSettings } from '../../settings/registerLatexSettings';
import { useRegisterTypstSettings } from '../../settings/registerTypstSettings';
import { useRegisterLSPConfigSettings } from '../../settings/registerLSPConfigSettings';

const AppBootstrap: React.FC = () => {
    useRegisterEditorSettings();
    useRegisterCollabSettings();
    useRegisterContentFormatterSettings();
    useRegisterFileSyncSettings();
    useRegisterFileSystemBackupSettings();
    useRegisterFileTreeSettings();
    useRegisterLanguageSettings();
    useRegisterLatexSettings();
    useRegisterTypstSettings();
    useRegisterLSPConfigSettings();
    return null;
};

export default AppBootstrap;