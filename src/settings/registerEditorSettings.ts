// src/settings/registorEditorSettings.ts
import { t } from '@/i18n';
import { useEffect, useRef } from 'react';

import { defaultEditorSettings, fontFamilyMap, fontSizeMap } from '../contexts/EditorContext';
import { useSettings } from '../hooks/useSettings';
import type { FontFamily, FontSize, HighlightTheme } from '../types/editor';

export function useRegisterEditorSettings() {
    const { batchGetSettings, registerSetting } = useSettings();
    const settingsRegisteredOnce = useRef(false);

    useEffect(() => {
        if (settingsRegisteredOnce.current) return;
        settingsRegisteredOnce.current = true;

        const batchedSettings = batchGetSettings([
            'editor-font-family',
            'editor-font-size',
            'editor-show-line-numbers',
            'editor-syntax-highlighting',
            'editor-theme-highlights',
            'editor-auto-save-enable',
            'editor-auto-save-delay',
            'editor-vim-mode',
            'editor-spell-check',
            'editor-mathlive-enabled',
            'editor-mathlive-preview-mode',
            'language',
        ]);

        const initialFontFamily =
            (batchedSettings['editor-font-family'] as FontFamily) ??
            defaultEditorSettings.fontFamily;
        const initialFontSize =
            (batchedSettings['editor-font-size'] as FontSize) ??
            defaultEditorSettings.fontSize;
        const initialShowLineNumbers =
            (batchedSettings['editor-show-line-numbers'] as boolean) ??
            defaultEditorSettings.showLineNumbers;
        const initialSyntaxHighlighting =
            (batchedSettings['editor-syntax-highlighting'] as boolean) ??
            defaultEditorSettings.syntaxHighlighting;
        const initialHighlightTheme =
            (batchedSettings['editor-theme-highlights'] as HighlightTheme) ??
            defaultEditorSettings.highlightTheme;
        const initialAutoSaveEnabled =
            (batchedSettings['editor-auto-save-enable'] as boolean) ??
            defaultEditorSettings.autoSaveEnabled;
        const initialAutoSaveDelay =
            (batchedSettings['editor-auto-save-delay'] as number) ??
            defaultEditorSettings.autoSaveDelay;
        const initialVimMode =
            (batchedSettings['editor-vim-mode'] as boolean) ??
            defaultEditorSettings.vimMode;
        const initialSpellCheck =
            (batchedSettings['editor-spell-check'] as boolean) ??
            defaultEditorSettings.spellCheck;
        const initialMathLiveEnabled =
            (batchedSettings['editor-mathlive-enabled'] as boolean) ??
            defaultEditorSettings.mathLiveEnabled;
        const initialMathLivePreviewMode =
            (batchedSettings['editor-mathlive-preview-mode'] as string) ??
            defaultEditorSettings.mathLivePreviewMode;

        document.documentElement.style.setProperty(
            '--editor-font-family',
            fontFamilyMap[initialFontFamily]
        );

        document.documentElement.style.setProperty(
            '--editor-font-size',
            fontSizeMap[initialFontSize]
        );

        registerSetting({
            id: 'editor-font-family',
            category: t('Appearance'),
            subcategory: t('Text Editor'),
            type: 'select',
            label: t('Font family'),
            description: t('Select the font family for the editor'),
            defaultValue: initialFontFamily,
            options: [
                { label: t('Monospace (System)'), value: 'monospace' },
                { label: t('JetBrains Mono'), value: 'jetbrains-mono' },
                { label: t('Fira Code'), value: 'fira-code' },
                { label: t('Source Code Pro'), value: 'source-code-pro' },
                { label: t('Inconsolata'), value: 'inconsolata' },
                { label: t('Serif'), value: 'serif' },
                { label: t('Sans Serif'), value: 'sans-serif' },
            ],
            onChange: (value) => {
                document.documentElement.style.setProperty(
                    '--editor-font-family',
                    fontFamilyMap[value as FontFamily]
                );
            },
        });

        registerSetting({
            id: 'editor-font-size',
            category: t('Appearance'),
            subcategory: t('Text Editor'),
            type: 'select',
            label: t('Font size'),
            description: t('Select the font size for the editor'),
            defaultValue: initialFontSize,
            options: [
                { label: t('Extra Small (10px)'), value: 'xs' },
                { label: t('Small (12px)'), value: 'sm' },
                { label: t('Base (14px)'), value: 'base' },
                { label: t('Large (16px)'), value: 'lg' },
                { label: t('Extra Large (18px)'), value: 'xl' },
                { label: t('2X Large (20px)'), value: '2xl' },
                { label: t('3X Large (24px)'), value: '3xl' },
            ],
            onChange: (value) => {
                document.documentElement.style.setProperty(
                    '--editor-font-size',
                    fontSizeMap[value as FontSize]
                );
            },
        });

        registerSetting({
            id: 'editor-show-line-numbers',
            category: t('Appearance'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Show line numbers'),
            description: t('Show line numbers in the editor'),
            defaultValue: initialShowLineNumbers,
        });

        registerSetting({
            id: 'editor-syntax-highlighting',
            category: t('Appearance'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Show syntax highlighting'),
            description: t('Show syntax highlighting in the editor including tooltip and linting (LaTeX, Typst, BibTeX, and markdown)'),
            defaultValue: initialSyntaxHighlighting,
        });

        registerSetting({
            id: 'editor-theme-highlights',
            category: t('Appearance'),
            subcategory: t('Text Editor'),
            type: 'select',
            label: t('Syntax highlighting theme'),
            description: t('Choose the color theme for syntax highlighting'),
            defaultValue: initialHighlightTheme,
            options: [
                { label: t('Auto (follows app theme)'), value: 'auto' },
                { label: t('Light'), value: 'light' },
                { label: t('Dark (One Dark)'), value: 'dark' },
                { label: 'Abcdef', value: 'abcdef' },
                { label: 'Abyss', value: 'abyss' },
                { label: 'Android Studio', value: 'androidstudio' },
                { label: 'Andromeda', value: 'andromeda' },
                { label: 'Atom One', value: 'atomone' },
                { label: 'Aura', value: 'aura' },
                { label: 'Basic Light', value: 'basicLight' },
                { label: 'Basic Dark', value: 'basicDark' },
                { label: 'BBEdit', value: 'bbedit' },
                { label: 'Bespin', value: 'bespin' },
                { label: 'Copilot', value: 'copilot' },
                { label: 'Darcula', value: 'darcula' },
                { label: 'Dracula', value: 'dracula' },
                { label: 'Duotone Dark', value: 'duotoneDark' },
                { label: 'Duotone Light', value: 'duotoneLight' },
                { label: 'Eclipse', value: 'eclipse' },
                { label: 'GitHub Light', value: 'githubLight' },
                { label: 'GitHub Dark', value: 'githubDark' },
                { label: 'Gruvbox Dark', value: 'gruvboxDark' },
                { label: 'Kimbie', value: 'kimbie' },
                { label: 'Material Dark', value: 'materialDark' },
                { label: 'Material Light', value: 'materialLight' },
                { label: 'Monokai', value: 'monokai' },
                { label: 'Monokai Dimmed', value: 'monokaiDimmed' },
                { label: 'Noctis Lilac', value: 'noctisLilac' },
                { label: 'Nord', value: 'nord' },
                { label: 'Okaidia', value: 'okaidia' },
                { label: 'Quiet Light', value: 'quietlight' },
                { label: 'Red', value: 'red' },
                { label: 'Solarized Light', value: 'solarizedLight' },
                { label: 'Solarized Dark', value: 'solarizedDark' },
                { label: 'Sublime', value: 'sublime' },
                { label: 'Tokyo Night', value: 'tokyoNight' },
                { label: 'Tokyo Night Storm', value: 'tokyoNightStorm' },
                { label: 'Tokyo Night Day', value: 'tokyoNightDay' },
                { label: 'Tomorrow Night Blue', value: 'tomorrowNightBlue' },
                { label: 'VS Code Dark', value: 'vscodeDark' },
                { label: 'VS Code Light', value: 'vscodeLight' },
                { label: 'White Light', value: 'whiteLight' },
                { label: 'White Dark', value: 'whiteDark' },
                { label: 'XCode Dark', value: 'xcodeDark' },
                { label: 'XCode Light', value: 'xcodeLight' },
            ],
        });

        registerSetting({
            id: 'editor-auto-save-enable',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Auto-save on changes'),
            description: t('Automatically save file changes while editing'),
            defaultValue: initialAutoSaveEnabled,
        });

        registerSetting({
            id: 'editor-auto-save-delay',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'number',
            label: t('Auto-save delay (milliseconds)'),
            description: t('Delay in milliseconds before saving changes'),
            defaultValue: initialAutoSaveDelay,
            min: 50,
            max: 10000,
        });

        registerSetting({
            id: 'editor-vim-mode',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Enable Vim keybindings'),
            description: t('Enable Vim-style keybindings in the editor'),
            defaultValue: initialVimMode,
        });

        registerSetting({
            id: 'editor-spell-check',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Enable spell checking'),
            description: t('Enable browser spell checking in the editor (note: not compatible with typesetter syntax)'),
            defaultValue: initialSpellCheck,
        });

        registerSetting({
            id: 'editor-mathlive-enabled',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Enable MathLive'),
            description: t('Enable interactive math editing with MathLive'),
            defaultValue: initialMathLiveEnabled,
        });

        registerSetting({
            id: 'editor-mathlive-preview-mode',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'select',
            label: t('MathLive preview mode'),
            description: t('When to show rendered math equations'),
            defaultValue: initialMathLivePreviewMode,
            options: [
                { label: t('On hover and cursor'), value: 'hover-cursor' },
                { label: t('On hover'), value: 'hover' },
                { label: t('On cursor'), value: 'cursor' },
            ],
        });
    }, [registerSetting, batchGetSettings]);
}