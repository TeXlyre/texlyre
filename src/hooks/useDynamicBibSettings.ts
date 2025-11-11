// src/hooks/useDynamicBibSettings.ts
import { t } from '@/i18n';
import { useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';
import { fileStorageService } from '../services/FileStorageService';

export const useDynamicBibSettings = () => {
  const { registerSetting, updateSetting, getSetting } = useSettings();

  const updateBibFileOptions = useCallback(async () => {
    try {
      const allFiles = await fileStorageService.getAllFiles();
      const bibFiles = allFiles.filter((file) =>
        (file.name.endsWith('.bib') || file.name.endsWith('.bibtex')) &&
        !file.isDeleted
      );

      const options = bibFiles.map((file) => ({
        label: file.name,
        value: file.path
      }));

      // Add option to create new file
      options.unshift({
        label: 'Create new bibliography.bib',
        value: 'CREATE_NEW'
      });

      // Update all LSP plugin settings that have target-bib-file settings
      const allSettings = getSetting('') || {};
      Object.keys(allSettings).forEach((settingId) => {
        if (settingId.endsWith('-target-bib-file')) {
          const currentSetting = getSetting(settingId);
          if (currentSetting) {
            // Update the setting options without changing the value
            registerSetting({
              ...currentSetting,
              options
            });
          }
        }
      });

    } catch (error) {
      console.error('Error updating bib file options:', error);
    }
  }, [getSetting, registerSetting]);

  const createNewBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
    try {
      const filePath = `/${fileName}`;

      // Check if file already exists
      const existingFile = await fileStorageService.getFileByPath(filePath);
      if (existingFile && !existingFile.isDeleted) {
        console.warn(`File ${filePath} already exists`);
        return filePath;
      }

      // Create new .bib file
      const fileNode = {
        id: crypto.randomUUID(),
        name: fileName,
        path: filePath,
        type: 'file' as const,
        content: '% Bibliography file created by TeXlyre\n% Add your BibTeX entries here\n\n',
        lastModified: Date.now(),
        size: 0,
        mimeType: 'text/x-bibtex',
        isBinary: false,
        isDeleted: false
      };

      await fileStorageService.storeFile(fileNode, { showConflictDialog: false });

      // Refresh options
      await updateBibFileOptions();

      return filePath;

    } catch (error) {
      console.error('Error creating new bib file:', error);
      return null;
    }
  }, [updateBibFileOptions]);

  const handleTargetFileChange = useCallback(async (settingId: string, newValue: string) => {
    if (newValue === 'CREATE_NEW') {
      const createdFile = await createNewBibFile();
      if (createdFile) {
        // Update the specific setting that triggered this
        updateSetting(settingId, createdFile);
        // Dispatch event to refresh file tree
        document.dispatchEvent(new CustomEvent('refresh-file-tree'));
      }
    }
  }, [createNewBibFile, updateSetting]);

  const registerLSPBibSetting = useCallback((pluginId: string, pluginName: string) => {
    const settingId = `${pluginId}-target-bib-file`;

    registerSetting({
      id: settingId,
      category: t("LSP"),
      subcategory: pluginName,
      type: 'select',
      label: t("Target bibliography file"),
      description: `Local .bib file to import ${pluginName} entries into`,
      defaultValue: '',
      options: [],
      onChange: (value: unknown) => handleTargetFileChange(settingId, value as string)
    });
  }, [registerSetting, handleTargetFileChange]);

  useEffect(() => {
    // Update options when component mounts
    updateBibFileOptions();

    // Listen for file tree changes
    const handleFileTreeChange = () => {
      updateBibFileOptions();
    };

    document.addEventListener('refresh-file-tree', handleFileTreeChange);

    // Set up periodic refresh (every 5 seconds when active)
    const interval = setInterval(updateBibFileOptions, 5000);

    return () => {
      document.removeEventListener('refresh-file-tree', handleFileTreeChange);
      clearInterval(interval);
    };
  }, [updateBibFileOptions]);

  return {
    updateBibFileOptions,
    createNewBibFile,
    handleTargetFileChange,
    registerLSPBibSetting
  };
};