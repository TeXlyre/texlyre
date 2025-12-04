// src/hooks/editor/useEditorView.ts
import { autocompletion, completionKeymap, type CompletionSource } from '@codemirror/autocomplete';
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
    bracketMatching,
    defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentOnInput,
    syntaxHighlighting,
} from '@codemirror/language';
import {
    highlightSelectionMatches,
    search,
    searchKeymap,
} from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { type ViewUpdate, keymap } from '@codemirror/view';
import { lineNumbers } from '@codemirror/view';
import { EditorView } from 'codemirror';
import { vim } from '@replit/codemirror-vim';
import { bibtex, bibtexCompletionSource } from 'codemirror-lang-bib';
import { latex, latexCompletionSource } from 'codemirror-lang-latex';
import { typst } from 'codemirror-lang-typst';
import { useEffect, useRef, useState } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';

import { pluginRegistry } from '../../plugins/PluginRegistry';
import { commentSystemExtension } from '../../extensions/codemirror/CommentExtension';
import { searchHighlightExtension } from '../../extensions/codemirror/SearchHighlightExtension';
import {
    createFilePathAutocompleteExtension,
    setCurrentFilePath,
    refreshBibliographyCache,
} from '../../extensions/codemirror/PathAndBibAutocompleteExtension.ts';
import {
    createLSPExtension,
    updateLSPPluginsInView,
    setCurrentFilePathInLSP,
} from '../../extensions/codemirror/LSPExtension';
import { createToolbarExtension } from '../../extensions/codemirror/ToolbarExtension';
import { createPasteExtension } from '../../extensions/codemirror/PasteExtension';
import { createListingsExtension } from '../../extensions/codemirror/ListingsExtension';

import { useAuth } from '../useAuth';
import { useEditor } from '../useEditor';

import { autoSaveManager } from '../../utils/autoSaveUtils';
import { collabService } from '../../services/CollabService';
import { fileStorageService } from '../../services/FileStorageService';
import { filePathCacheService } from '../../services/FilePathCacheService';

import { registerYjsBinding } from './yjsBinding';
import { registerEditorClipboard } from './editorClipboard';
import { registerEditorSearchHighlightEvents } from './editorSearchHighlights';
import { registerEditorEventHandlers } from './EditorEvents';

export const useEditorView = (
    editorRef: React.RefObject<HTMLDivElement>,
    docUrl: string,
    documentId: string,
    isDocumentSelected: boolean,
    textContent: string,
    onUpdateContent: (content: string) => void,
    _parseComments: (text: string) => unknown[],
    _addComment: (content: string) => unknown,
    updateComments: (content: string) => void,
    isEditingFile = false,
    isViewOnly = false,
    fileName?: string,
    currentFileId?: string,
    enableComments = false,
    toolbarVisible = true,
) => {
    const {
        getAutoSaveEnabled,
        getAutoSaveDelay,
        getLineNumbersEnabled,
        getSyntaxHighlightingEnabled,
        getVimModeEnabled,
        getSpellCheckEnabled,
        getCollabOptions,
        getEnabledLSPPlugins,
        editorSettingsVersion,
        editorSettings,
    } = useEditor();

    const { user } = useAuth();

    const ytextRef = useRef<Y.Text | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isUpdatingRef = useRef<boolean>(false);
    const autoSaveRef = useRef<(() => void) | null>(null);
    const currentContentRef = useRef<string>(textContent);
    const [showSaveIndicator, setShowSaveIndicator] = useState(false);
    const [yDoc, setYDoc] = useState<Y.Doc | null>(null);
    const [provider, setProvider] = useState<WebrtcProvider | null>(null);
    const hasEmittedReadyRef = useRef<boolean>(false);

    const projectId = docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl;

    // Keep file content when switching between modes
    useEffect(() => {
        if (isEditingFile && !viewRef.current) {
            currentContentRef.current = textContent;
        }
    }, [textContent, isEditingFile]);

    // File path cache lifecycle
    useEffect(() => {
        filePathCacheService.initialize();

        return () => {
            filePathCacheService.cleanup();
        };
    }, []);

    const saveFileToStorage = async (content: string) => {
        if (!currentFileId || !isEditingFile) return;
        try {
            const encoder = new TextEncoder();
            const contentBuffer = encoder.encode(content).buffer;
            await fileStorageService.updateFileContent(currentFileId, contentBuffer);

            if (fileName?.endsWith('.bib') && viewRef.current) {
                refreshBibliographyCache(viewRef.current);
            }

            setShowSaveIndicator(true);
            setTimeout(() => setShowSaveIndicator(false), 1500);

            document.dispatchEvent(
                new CustomEvent('file-saved', {
                    detail: {
                        isFile: true,
                        fileId: currentFileId,
                    },
                }),
            );
        } catch (error) {
            console.error('Error saving file:', error);
        }
    };

    const saveDocumentToLinkedFile = async (content: string) => {
        if (!documentId || isEditingFile) return;
        try {
            const allFiles = await fileStorageService.getAllFiles(false);
            const linkedFile = allFiles.find((file) => file.documentId === documentId);
            if (linkedFile) {
                await fileStorageService.updateFileContent(linkedFile.id, content);

                if (linkedFile.name.endsWith('.bib') && viewRef.current) {
                    refreshBibliographyCache(viewRef.current);
                }

                setShowSaveIndicator(true);
                setTimeout(() => setShowSaveIndicator(false), 1500);

                document.dispatchEvent(
                    new CustomEvent('file-saved', {
                        detail: {
                            isFile: false,
                            documentId,
                            fileId: linkedFile.id,
                            filePath: linkedFile.path,
                        },
                    }),
                );
            }
        } catch (error) {
            console.error('Error saving document to linked file:', error);
        }
    };

    const spellCheckExtension = () => {
        if (!getSpellCheckEnabled()) {
            return [];
        }
        return EditorView.contentAttributes.of({
            spellcheck: 'true',
            contenteditable: 'true',
        });
    };

    const getCursorTrackingExtension = (): Extension => {
        let cursorUpdateTimeout: NodeJS.Timeout | null = null;

        return EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
                if (isEditingFile && viewRef.current) {
                    currentContentRef.current = viewRef.current.state.doc.toString();
                }
                if (autoSaveRef.current) {
                    autoSaveRef.current();
                }
            }

            if (update.selectionSet) {
                if (cursorUpdateTimeout) {
                    clearTimeout(cursorUpdateTimeout);
                }

                cursorUpdateTimeout = setTimeout(() => {
                    if (update.view && update.view.state) {
                        const pos = update.view.state.selection.main.head;
                        const line = update.view.state.doc.lineAt(pos).number;

                        document.dispatchEvent(
                            new CustomEvent('editor-cursor-update', {
                                detail: {
                                    line,
                                    position: pos,
                                    fileId: currentFileId,
                                    documentId,
                                    isEditingFile,
                                },
                            }),
                        );
                    }
                }, 200);
            }
        });
    };

    const getBasicSetupExtensions = (): Extension[] => {
        const extensions = [
            EditorView.theme({
                '.cm-content': {
                    fontFamily: editorSettings.fontFamily,
                    fontSize: editorSettings.fontSize,
                },
            }),
            EditorView.lineWrapping,
            history(),
            foldGutter(),
            indentOnInput(),
            bracketMatching(),
            autocompletion(),
            highlightSelectionMatches(),
            search(),
            spellCheckExtension(),
            keymap.of([
                indentWithTab,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
            ]),
        ];

        if (getLineNumbersEnabled()) extensions.push(lineNumbers());
        if (getSyntaxHighlightingEnabled()) {
            const highlightTheme = editorSettings.highlightTheme || 'auto';

            let useDarkTheme = false;
            if (highlightTheme === 'auto') {
                useDarkTheme =
                    document.documentElement.getAttribute('data-theme') === 'dark';
            } else if (highlightTheme === 'dark') {
                useDarkTheme = true;
            }

            if (useDarkTheme) {
                extensions.push(oneDark);
            } else {
                extensions.push(
                    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                );
            }
        }

        if (getVimModeEnabled()) {
            extensions.push(vim());
        }

        extensions.push(getCursorTrackingExtension());
        extensions.push(searchHighlightExtension);
        return extensions;
    };

    const getLanguageExtension = (fn?: string, content?: string): Extension[] => {
        if (!getSyntaxHighlightingEnabled()) {
            return [];
        }

        if (!fn) {
            if (
                content?.includes('@article') ||
                content?.includes('@book') ||
                content?.includes('@inproceedings')
            ) {
                return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
            }
            if (
                content?.includes('= ') ||
                content?.includes('== ') ||
                content?.includes('#import') ||
                content?.includes('#let')
            ) {
                return [typst()];
            }
            return [latex({ autoCloseBrackets: false, enableAutocomplete: false })];
        }

        const ext = fn.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'tex':
            case 'latex':
                return [latex({ autoCloseBrackets: false, enableAutocomplete: false })];
            case 'typ':
            case 'typst':
                return [typst()];
            case 'bib':
            case 'bibtex':
                return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
            case 'md':
            case 'markdown':
                return [markdown()];
            default:
                if (
                    content?.includes('@article') ||
                    content?.includes('@book') ||
                    content?.includes('@inproceedings')
                ) {
                    return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
                }
                if (
                    content?.includes('= ') ||
                    content?.includes('== ') ||
                    content?.includes('#import') ||
                    content?.includes('#let')
                ) {
                    return [typst()];
                }
                return [latex({ autoCloseBrackets: false, enableAutocomplete: false })];
        }
    };

    // --- Yjs / collaboration connection ---
    useEffect(() => {
        if (!isDocumentSelected || isEditingFile || !documentId || !projectId) {
            return;
        }

        const collectionName = `yjs_${documentId}`;
        const collabOptions = getCollabOptions();
        const { doc, provider } = collabService.connect(
            projectId,
            collectionName,
            collabOptions ?? {},
        );
        setYDoc(doc);
        setProvider(provider);

        const ytext = doc.getText('codemirror');
        ytextRef.current = ytext;

        if (user) {
            collabService.setUserInfo(projectId, collectionName, {
                id: user.id,
                username: user.username,
                name: user.name,
                color: user.color,
                colorLight: user.colorLight,
                passwordHash: '',
                createdAt: 0,
            });
        }

        return () => {
            collabService.disconnect(projectId, collectionName);
            setYDoc(null);
            setProvider(null);
            ytextRef.current = null;
        };
    }, [
        projectId,
        documentId,
        isDocumentSelected,
        isEditingFile,
        user,
        getCollabOptions,
    ]);

    // --- Create / recreate EditorView when dependencies change ---
    useEffect(() => {
        if (
            !editorRef.current ||
            (!ytextRef.current && !isEditingFile) ||
            !isDocumentSelected
        ) {
            return;
        }

        // Preserve content before destroying view
        if (viewRef.current && isEditingFile) {
            const currentContent = viewRef.current.state.doc.toString();
            currentContentRef.current = currentContent;
        }

        if (viewRef.current) {
            viewRef.current.destroy();
            viewRef.current = null;
        }

        const contentToUse = isEditingFile
            ? currentContentRef.current
            : ytextRef.current?.toString() || '';

        const extensions: Extension[] = [];

        const isLatexFile =
            fileName?.endsWith('.tex') ||
            (!fileName && contentToUse?.includes('\\'));
        const isBibFile =
            fileName?.endsWith('.bib') ||
            fileName?.endsWith('.bibtex') ||
            (!fileName &&
                (contentToUse?.includes('@article') ||
                    contentToUse?.includes('@book') ||
                    contentToUse?.includes('@inproceedings')));
        const isTypstFile =
            fileName?.endsWith('.typ') ||
            fileName?.endsWith('.typst') ||
            (!fileName &&
                (contentToUse?.includes('= ') ||
                    contentToUse?.includes('== ') ||
                    contentToUse?.includes('#import')));

        if (isLatexFile && !isBibFile) {
            extensions.push(createListingsExtension('latex'));
        }

        if (isTypstFile) {
            extensions.push(createListingsExtension('typst'));
        }

        extensions.push(...getBasicSetupExtensions());
        extensions.push(...getLanguageExtension(fileName, contentToUse));

        if (isLatexFile || isBibFile || isTypstFile) {
            const fileExtension =
                fileName?.split('.').pop()?.toLowerCase() ||
                (isTypstFile ? 'typ' : isBibFile ? 'bib' : 'tex');
            const allLSPPlugins =
                pluginRegistry.getLSPPluginsForFileType(fileExtension);

            const enabledPluginIds = getEnabledLSPPlugins();
            const availableLSPPlugins = allLSPPlugins.filter((plugin) =>
                enabledPluginIds.includes(plugin.id),
            );

            const completionSources: CompletionSource[] = [];

            if (availableLSPPlugins.length > 0) {
                const [lspField, lspPlugin, lspCompletionSource] = createLSPExtension();
                extensions.push(lspField, lspPlugin);
                completionSources.push(lspCompletionSource);

                setTimeout(() => {
                    if (viewRef.current) {
                        updateLSPPluginsInView(viewRef.current, availableLSPPlugins);

                        if (isEditingFile && currentFileId) {
                            fileStorageService.getFile(currentFileId).then((file) => {
                                if (file && viewRef.current) {
                                    setCurrentFilePathInLSP(viewRef.current, file.path);

                                    availableLSPPlugins.forEach((plugin) => {
                                        if ('setCurrentFilePath' in plugin) {
                                            (plugin as any).setCurrentFilePath(file.path);
                                        }
                                    });
                                }
                            });
                        }
                    }
                }, 100);
            }

            if (isLatexFile || isTypstFile) {
                let currentFilePath = '';
                if (isEditingFile && currentFileId) {
                    const getCurrentFilePath = async () => {
                        const file = await fileStorageService.getFile(currentFileId);
                        return file?.path || '';
                    };

                    void getCurrentFilePath().then((path) => {
                        currentFilePath = path;
                    });
                }

                const [stateExtensions, filePathPlugin, enhancedCompletionSource] =
                    createFilePathAutocompleteExtension(currentFilePath);
                extensions.push(stateExtensions, filePathPlugin);

                extensions.push(createPasteExtension(currentFileId, fileName));

                if (toolbarVisible) {
                    if (isLatexFile) {
                        extensions.push(createToolbarExtension('latex'));
                    } else if (isTypstFile) {
                        extensions.push(createToolbarExtension('typst'));
                    }
                }

                completionSources.push(enhancedCompletionSource);

                if (isLatexFile) {
                    completionSources.push(latexCompletionSource(true));
                }
            } else if (isBibFile) {
                const [stateExtensions, filePathPlugin, enhancedCompletionSource] =
                    createFilePathAutocompleteExtension('');
                extensions.push(stateExtensions, filePathPlugin);

                completionSources.push(enhancedCompletionSource);
                completionSources.push(bibtexCompletionSource);
            }

            if (isEditingFile && currentFileId) {
                setTimeout(async () => {
                    const file = await fileStorageService.getFile(currentFileId);
                    if (file && viewRef.current) {
                        setCurrentFilePath(viewRef.current, file.path);
                        filePathCacheService.updateCurrentFilePath(file.path);

                        availableLSPPlugins.forEach((plugin) => {
                            if ('setCurrentFilePath' in plugin) {
                                (plugin as any).setCurrentFilePath(file.path);
                            }
                        });
                    }
                }, 100);
            } else if (!isEditingFile && documentId) {
                setTimeout(() => {
                    if (viewRef.current) {
                        filePathCacheService.updateCurrentFilePath('', documentId);
                    }
                }, 100);
            }

            extensions.push(
                autocompletion({
                    override: completionSources,
                    maxRenderedOptions: 20,
                    closeOnBlur: false,
                }),
            );
        } else {
            extensions.push(autocompletion());
        }

        if (isViewOnly) extensions.push(EditorState.readOnly.of(true));

        // Collaborative undo / awareness (only for documents)
        if (!isEditingFile && provider && ytextRef.current) {
            extensions.push(keymap.of(yUndoManagerKeymap));
            extensions.push(yCollab(ytextRef.current, provider.awareness));
        }

        if (enableComments && !isViewOnly) {
            const commentKeymap = keymap.of([
                {
                    key: 'Alt-c',
                    run: (view) => {
                        if (isViewOnly) return false;
                        const selection = view.state.selection;
                        const primaryRange = selection.main;
                        if (primaryRange.from !== primaryRange.to) {
                            try {
                                document.dispatchEvent(
                                    new CustomEvent('show-comment-modal', {
                                        detail: { selection: primaryRange },
                                    }),
                                );
                                return true;
                            } catch (error) {
                                console.error('Error in commentKeymap:', error);
                            }
                        }
                        return false;
                    },
                },
            ]);

            extensions.push(commentKeymap);
            extensions.push(commentSystemExtension);
        }

        const formatKeymap = keymap.of([
            {
                key: 'Ctrl-Shift-i',
                run: (view) => {
                    if (isViewOnly) return false;

                    const hasFormatter = isLatexFile || isTypstFile || isBibFile;
                    if (!hasFormatter) return false;

                    const content = view.state.doc.toString();
                    const contentType = isTypstFile ? 'typst' : 'latex';

                    document.dispatchEvent(
                        new CustomEvent('trigger-format', {
                            detail: {
                                content,
                                contentType,
                                fileId: currentFileId,
                                documentId,
                                view,
                            },
                        }),
                    );

                    return true;
                },
            },
        ]);
        extensions.push(formatKeymap);

        const saveKeymap = keymap.of([
            {
                key: 'Ctrl-s',
                run: (view) => {
                    if (isViewOnly) {
                        setShowSaveIndicator(true);
                        setTimeout(() => setShowSaveIndicator(false), 2000);
                        return true;
                    }

                    const content = view.state.doc.toString();
                    if (isEditingFile && currentFileId) {
                        void saveFileToStorage(content);
                    } else if (!isEditingFile && documentId) {
                        void saveDocumentToLinkedFile(content);
                    }
                    return true;
                },
            },
        ]);
        extensions.push(saveKeymap);

        const state = EditorState.create({
            doc: contentToUse,
            extensions,
        });

        try {
            const view = new EditorView({ state, parent: editorRef.current });
            viewRef.current = view;

            setTimeout(() => {
                document.dispatchEvent(
                    new CustomEvent('editor-ready', {
                        detail: {
                            fileId: currentFileId,
                            documentId,
                            isEditingFile,
                        },
                    }),
                );
            }, 50);

            if (isLatexFile || isTypstFile) {
                filePathCacheService.updateCache();
            }
        } catch (error) {
            console.error('Error creating editor view:', error);
        }

        return () => {
            if (viewRef.current) {
                filePathCacheService.cleanup();
                viewRef.current.destroy();
                viewRef.current = null;
            }
        };
    }, [
        editorRef,
        yDoc,
        provider,
        isDocumentSelected,
        isEditingFile,
        textContent,
        isViewOnly,
        fileName,
        editorSettingsVersion,
        getEnabledLSPPlugins,
        enableComments,
        toolbarVisible,
    ]);

    // --- Clipboard handling ---
    useEffect(() => {
        if (!editorRef.current || !viewRef.current) return;

        const cleanup = registerEditorClipboard(editorRef.current, viewRef);
        return cleanup;
    }, [editorRef, viewRef]);

    // --- Auto-save ---
    useEffect(() => {
        const autoSaveKey = isEditingFile ? currentFileId : documentId;

        if (autoSaveRef.current && autoSaveKey) {
            autoSaveManager.clearAutoSaver(autoSaveKey);
            autoSaveRef.current = null;
        }

        if (!autoSaveKey || isViewOnly) {
            return;
        }

        const autoSaveEnabled = getAutoSaveEnabled();
        const autoSaveDelay = getAutoSaveDelay();

        if (!autoSaveEnabled) {
            return;
        }

        const setupAutoSave = () => {
            if (!viewRef.current) {
                setTimeout(setupAutoSave, 100);
                return;
            }

            autoSaveRef.current = autoSaveManager.createAutoSaver(
                autoSaveKey,
                () => {
                    const currentEditorContent =
                        viewRef.current?.state?.doc?.toString() || '';
                    return currentEditorContent;
                },
                {
                    enabled: true,
                    delay: autoSaveDelay,
                    onSave: async (_saveKey, content) => {
                        if (isEditingFile && currentFileId) {
                            await saveFileToStorage(content);
                        } else if (!isEditingFile && documentId) {
                            await saveDocumentToLinkedFile(content);
                        }
                    },
                    onError: (error) => {
                        console.error('Auto-save failed:', error);
                    },
                },
            );
        };

        setupAutoSave();

        return () => {
            if (autoSaveKey) {
                autoSaveManager.clearAutoSaver(autoSaveKey);
            }
            autoSaveRef.current = null;
        };
    }, [
        isEditingFile,
        isViewOnly,
        currentFileId,
        documentId,
        getAutoSaveEnabled,
        getAutoSaveDelay,
        editorSettingsVersion,
    ]);

    // --- Yjs -> React binding / content sync ---
    useEffect(() => {
        if (!ytextRef.current || !isDocumentSelected || isEditingFile) return;

        const cleanup = registerYjsBinding(ytextRef.current, {
            enableComments,
            onUpdateContent,
            updateComments,
            autoSaveRef,
            isUpdatingRef,
            viewRef,
            hasEmittedReadyRef,
            currentFileId,
            documentId,
            isEditingFile,
        });

        return cleanup;
    }, [
        ytextRef,
        isDocumentSelected,
        isEditingFile,
        enableComments,
        onUpdateContent,
        updateComments,
        currentFileId,
        documentId,
    ]);

    // --- Search highlight custom events ---
    useEffect(() => {
        if (!viewRef.current) return;

        const cleanup = registerEditorSearchHighlightEvents(viewRef);
        return cleanup;
    }, [viewRef]);

    // --- Editor document-level events (comments, goto, save triggers) ---
    useEffect(() => {
        if (!viewRef.current || !isDocumentSelected) return;

        const cleanup = registerEditorEventHandlers(viewRef, {
            isViewOnly,
            isEditingFile,
            currentFileId,
            documentId,
            enableComments,
            updateComments,
            saveFileToStorage,
            saveDocumentToLinkedFile,
            setShowSaveIndicator,
        });

        return cleanup;
    }, [
        viewRef,
        isDocumentSelected,
        isViewOnly,
        isEditingFile,
        currentFileId,
        documentId,
        enableComments,
        updateComments,
        saveFileToStorage,
        saveDocumentToLinkedFile,
        setShowSaveIndicator,
    ]);

    // --- Flush pending auto-saves on unmount ---
    useEffect(() => {
        return () => {
            const autoSaveKey = isEditingFile ? currentFileId : documentId;
            if (autoSaveKey) {
                autoSaveManager.flushPendingSaves().catch(console.error);
                autoSaveManager.clearAutoSaver(autoSaveKey);
            }
        };
    }, [currentFileId, documentId, isEditingFile]);

    return { viewRef, isUpdatingRef, showSaveIndicator };
};
