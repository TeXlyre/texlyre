// src/editor/FileCreationMenu.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useRef } from 'react';

import { pluginRegistry } from '../../plugins/PluginRegistry';
import { FilePlusIcon } from '../common/Icons';
import DropdownMenu from '../common/DropdownMenu';

interface FileCreationMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (fileName: string, extension: string) => void;
    triggerElement: HTMLElement | null;
    projectType: 'latex' | 'typst';
    parentPath?: string;
    mode?: 'dropdown' | 'submenu';
}

interface FileTemplate {
    label: string;
    extension: string;
    icon?: React.ComponentType;
    category: 'project' | 'viewers';
}

const FileCreationMenu: React.FC<FileCreationMenuProps> = ({
    isOpen,
    onClose,
    onCreate,
    triggerElement,
    projectType,
    parentPath = '/',
    mode = 'dropdown'
}) => {
    const targetRef = useRef<HTMLElement>(null);

    if (triggerElement && targetRef.current !== triggerElement) {
        (targetRef as React.MutableRefObject<HTMLElement | null>).current = triggerElement;
    }

    const fileTemplates: FileTemplate[] = [
        ...(projectType === 'latex' ? [
            { label: t('LaTeX File'), extension: '.tex', category: 'project' as const },
            { label: t('LaTeX Class'), extension: '.cls', category: 'project' as const },
            { label: t('LaTeX Style'), extension: '.sty', category: 'project' as const }] : [
            { label: t('Typst File'), extension: '.typ', category: 'project' as const }
        ]),
        ...pluginRegistry.getEditableViewersWithExtensions().flatMap(viewer => {
            const extensions = viewer.getSupportedExtensions?.() || [];
            return extensions.map(ext => ({
                label: ext.fileLabel || viewer.name,
                extension: `.${ext.extension}`,
                icon: viewer.icon,
                category: 'viewers' as const
            }));
        }),
        { label: t('Other'), extension: '', category: 'project' as const }
    ];

    const projectFiles = fileTemplates.filter(t => t.category === 'project');
    const viewerFiles = fileTemplates.filter(t => t.category === 'viewers');

    const handleCreateFile = (extension: string) => {
        const baseName = extension === '' ? 'new_file' : `new_file${extension}`;
        onCreate(baseName, extension);
        onClose();
    };

    return (
        <DropdownMenu
            targetRef={targetRef}
            isOpen={isOpen}
            onClose={onClose}
            mode={mode}
            width={250}
            maxHeight={400}
            className="file-creation-dropdown">

            <div className="dropdown-section">
                {projectFiles.map((template, idx) =>
                    <button
                        key={`project-${idx}`}
                        className="dropdown-item"
                        onClick={() => handleCreateFile(template.extension)}>

                        {template.icon ? <template.icon /> : <FilePlusIcon />}
                        <span className="dropdown-label">{t(template.label)}</span>
                        <span className="dropdown-value">{template.extension}</span>
                    </button>
                )}
            </div>

            {viewerFiles.length > 0 &&
                <>
                    <div className="dropdown-section">
                        <div className="dropdown-title">{t('Editable Viewers')}</div>
                        {viewerFiles.map((template, idx) =>
                            <button
                                key={`viewer-${idx}`}
                                className="dropdown-item"
                                onClick={() => handleCreateFile(template.extension)}>

                                {template.icon ? <template.icon /> : <FilePlusIcon />}
                                <span className="dropdown-label">{t(template.label)}</span>
                                <span className="dropdown-value">{template.extension}</span>
                            </button>
                        )}
                    </div>
                </>
            }
        </DropdownMenu>
    );
};

export default FileCreationMenu;