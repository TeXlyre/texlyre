import { t } from '@/i18n';
import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';

export function useRegisterFileTreeSettings() {
    const { registerSetting, getSetting } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const initialFileSystemDragDrop =
            getSetting('file-tree-filesystem-drag-drop')?.value as boolean ?? true;
        const initialInternalDragDrop =
            getSetting('file-tree-internal-drag-drop')?.value as boolean ?? true;

        registerSetting({
            id: 'file-tree-filesystem-drag-drop',
            category: t('Viewers'),
            subcategory: t('File Explorer'),
            type: 'checkbox',
            label: t('Enable file system drag and drop'),
            description: t('Allow dragging files from your file system into the file explorer'),

            defaultValue: true
        });

        registerSetting({
            id: 'file-tree-internal-drag-drop',
            category: t('Viewers'),
            subcategory: t('File Explorer'),
            type: 'checkbox',
            label: t('Enable internal (local) drag and drop'),
            description: t('Allow dragging files and folders within the TeXlyre file explorer to move them'),

            defaultValue: true
        });

        void initialFileSystemDragDrop;
        void initialInternalDragDrop;
    }, [registerSetting, getSetting]);
}