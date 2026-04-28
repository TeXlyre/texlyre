// src/hooks/editor/useEditorView.ts
import { type CompletionSource, autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
    defaultKeymap,
    history,
    historyKeymap,
    historyField,
    indentWithTab,
} from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { html } from '@codemirror/lang-html';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import {
    bracketMatching,
    foldGutter,
    foldKeymap,
    indentOnInput,
    bidiIsolates
} from '@codemirror/language';
import {
    highlightSelectionMatches,
    search,
    searchKeymap,
} from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { type ViewUpdate, keymap } from '@codemirror/view';
import { lineNumbers } from '@codemirror/view';
import { EditorView } from 'codemirror';
import { vim } from '@replit/codemirror-vim';
import { bibtex, bibtexCompletionSource } from 'codemirror-lang-bib';
import { latex, latexCompletionSource } from 'codemirror-lang-latex';
import { typst } from 'codemirror-lang-typst';
import { useEffect, useRef, useState } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { UndoManager } from 'yjs';

import { resolveHighlightTheme } from '../../extensions/codemirror/HighlightThemeExtension';
import { commentSystemExtension } from '../../extensions/codemirror/CommentExtension';
import { latexTypstBidiIsolates } from '../../extensions/codemirror/BidiExtension';
import { searchHighlightExtension } from '../../extensions/codemirror/SearchHighlightExtension';
import {
    createFilePathAutocompleteExtension,
    setCurrentFilePath,
    refreshBibliographyCache,
} from '../../extensions/codemirror/PathAndBibAutocompleteExtension.ts';
import {
    getGenericLSPExtensionsForFile,
    getGenericLSPCompletionSources,
} from '../../extensions/codemirror/GenericLSPExtension';
import { createCodeActionsExtension } from '../../extensions/codemirror/CodeActionsLSPExtension.ts';
import { createToolbarExtension } from '../../extensions/codemirror/ToolbarExtension';
import { createMathLiveExtension } from '../../extensions/codemirror/MathLiveExtension';
import { createPasteExtension } from '../../extensions/codemirror/PasteExtension';
import { createListingsExtension } from '../../extensions/codemirror/ListingsExtension';
import {
    createLinkNavigationExtension,
    updateLinkNavigationFilePath,
    updateLinkNavigationFileName
} from '../../extensions/codemirror/LinkNavigationExtension';
import { useAuth } from '../useAuth';
import { useEditor } from '../useEditor';
import { autoSaveManager } from '../../utils/autoSaveUtils';
import { detectFileType, isBibFile } from '../../utils/fileUtils.ts';
import { collabService } from '../../services/CollabService';
import { fileStorageService } from '../../services/FileStorageService';
import { filePathCacheService } from '../../services/FilePathCacheService';
import type { CollabProvider } from '../../types/collab';
import { registerYjsBinding } from './yjsBinding';
import { registerEditorClipboard } from './editorClipboard';
import { registerEditorSearchHighlightEvents } from './editorSearchHighlights';
import { registerEditorEventHandlers } from './EditorEvents';

type FileTypeInfo = {
    fileType: ReturnType<typeof detectFileType>;
    isLatex: boolean;
    isTypst: boolean;
    isBib: boolean;
    isMarkdown: boolean;
    hasFormatter: boolean;
    isStructured: boolean;
};

const classifyFileType = (fileName: string | undefined, content: string): FileTypeInfo => {
    const fileType = detectFileType(fileName, content);
    const isLatex = fileType === 'latex';
    const isTypst = fileType === 'typst';
    const isBib = fileType === 'bib';
    const isMarkdown = fileType === 'markdown';
    return {
        fileType,
        isLatex,
        isTypst,
        isBib,
        isMarkdown,
        hasFormatter: isLatex || isTypst || isBib,
        isStructured: isLatex || isTypst || isBib || isMarkdown,
    };
};

const fileHistoryCache = new Map<string, unknown>();

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
    const [showSaveIndicator, setShowSaveIndicator] = useState(false);
    const [yDoc, setYDoc] = useState<Y.Doc | null>(null);
    const [provider, setProvider] = useState<CollabProvider | null>(null);
    const hasEmittedReadyRef = useRef<boolean>(false);
    const undoManagerRef = useRef<UndoManager | null>(null);

    const projectId = docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl;

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

            if (fileName && isBibFile(fileName) && viewRef.current) {
                refreshBibliographyCache(viewRef.current);
            }

            const file = await fileStorageService.getFile(currentFileId);

            setShowSaveIndicator(true);
            setTimeout(() => setShowSaveIndicator(false), 1500);

            document.dispatchEvent(
                new CustomEvent('file-saved', {
                    detail: {
                        isFile: true,
                        fileId: currentFileId,
                        filePath: file?.path,
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
            const allFiles = await fileStorageService.getAllFiles(false, false, false);
            const linkedFile = allFiles.find((file) => file.documentId === documentId);
            if (linkedFile) {
                await fileStorageService.updateFileContent(linkedFile.id, content);

                if (isBibFile(linkedFile.name) && viewRef.current) {
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

    const buildSpellCheckExtension = (): Extension => {
        if (!getSpellCheckEnabled()) return [];
        return EditorView.contentAttributes.of({
            spellcheck: 'true',
            contenteditable: 'true',
        });
    };

    const buildCursorTrackingExtension = (): Extension => {
        let cursorUpdateTimeout: NodeJS.Timeout | null = null;

        return EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged && autoSaveRef.current) {
                autoSaveRef.current();
            }

            if (update.selectionSet) {
                if (cursorUpdateTimeout) clearTimeout(cursorUpdateTimeout);
                cursorUpdateTimeout = setTimeout(() => {
                    if (!update.view?.state) return;
                    const pos = update.view.state.selection.main.head;
                    const line = update.view.state.doc.lineAt(pos).number;
                    document.dispatchEvent(
                        new CustomEvent('editor-cursor-update', {
                            detail: { line, position: pos, fileId: currentFileId, documentId, isEditingFile },
                        }),
                    );
                }, 200);
            }
        });
    };

    const buildBaseExtensions = (): Extension[] => {
        const extensions: Extension[] = [
            EditorView.theme({
                '.cm-content': {
                    fontFamily: editorSettings.fontFamily,
                    fontSize: editorSettings.fontSize,
                },
            }),
            EditorView.lineWrapping,
            foldGutter(),
            indentOnInput(),
            bidiIsolates(),
            bracketMatching(),
            closeBrackets(),
            highlightSelectionMatches(),
            search(),
            buildSpellCheckExtension(),
            keymap.of([
                indentWithTab,
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...foldKeymap,
                ...completionKeymap,
            ]),
            buildCursorTrackingExtension(),
            searchHighlightExtension,
        ];

        if (getLineNumbersEnabled()) extensions.push(lineNumbers());
        if (getSyntaxHighlightingEnabled()) {
            extensions.push(resolveHighlightTheme(editorSettings.highlightTheme || 'auto'));
        }
        if (getVimModeEnabled()) extensions.push(vim());

        return extensions;
    };

    const buildLanguageExtension = (info: FileTypeInfo): Extension[] => {
        if (!getSyntaxHighlightingEnabled()) return [];

        switch (info.fileType) {
            case 'latex':
                return [latex({ autoCloseBrackets: false, enableAutocomplete: false, fileName })];
            case 'typst':
                return [typst()];
            case 'bib':
                return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
            case 'markdown':
                return [markdown({ base: markdownLanguage, codeLanguages: languages, htmlTagLanguage: html() })];
            case 'json':
                return [json()];
            case 'yaml':
                return [yaml()];
            case 'html':
                return [html()];
            default:
                return [];
        }
    };

    const buildLanguageSpecificExtensions = (
        info: FileTypeInfo,
        content: string,
        completionSources: CompletionSource[],
    ): Extension[] => {
        const extensions: Extension[] = [];

        if (!info.isStructured) return extensions;

        extensions.push(createLinkNavigationExtension(fileName, content));

        if (info.isLatex || info.isTypst) {
            const [stateExtensions, filePathPlugin, enhancedCompletionSource] =
                createFilePathAutocompleteExtension('');
            extensions.push(stateExtensions, filePathPlugin);
            extensions.push(createPasteExtension(currentFileId, fileName));

            if (toolbarVisible) {
                extensions.push(createToolbarExtension(info.fileType as 'latex' | 'typst', undoManagerRef.current || undefined));
            }

            if (editorSettings.mathLiveEnabled) {
                extensions.push(createMathLiveExtension(
                    info.fileType as 'latex' | 'typst',
                    editorSettings.mathLivePreviewMode,
                    editorSettings.language,
                ));
            }

            completionSources.push(enhancedCompletionSource);
            if (info.isLatex) completionSources.push(latexCompletionSource(true));
        } else if (info.isBib) {
            const [stateExtensions, filePathPlugin, enhancedCompletionSource] =
                createFilePathAutocompleteExtension('');
            extensions.push(stateExtensions, filePathPlugin);
            completionSources.push(enhancedCompletionSource);
            completionSources.push(bibtexCompletionSource);
        }

        return extensions;
    };

    const scheduleFilePathSync = (info: FileTypeInfo) => {
        if (!info.isStructured) return;

        if (isEditingFile && currentFileId) {
            setTimeout(async () => {
                const file = await fileStorageService.getFile(currentFileId);
                if (file && viewRef.current) {
                    setCurrentFilePath(viewRef.current, file.path);
                    filePathCacheService.updateCurrentFilePath(file.path);
                    updateLinkNavigationFilePath(viewRef.current, file.path);
                    updateLinkNavigationFileName(viewRef.current, fileName || '');
                }
            }, 100);
        } else if (!isEditingFile && documentId) {
            setTimeout(async () => {
                if (!viewRef.current) return;
                filePathCacheService.updateCurrentFilePath('', documentId);
                updateLinkNavigationFileName(viewRef.current, fileName || '');

                const allFiles = await fileStorageService.getAllFiles(false, false, false);
                const linkedFile = allFiles.find((file) => file.documentId === documentId);
                if (linkedFile && viewRef.current) {
                    updateLinkNavigationFilePath(viewRef.current, linkedFile.path);
                }
            }, 100);
        }
    };

    const buildKeymapExtensions = (info: FileTypeInfo): Extension[] => {
        const formatBinding = keymap.of([
            {
                key: 'Ctrl-Shift-i',
                run: (view) => {
                    if (isViewOnly || !info.hasFormatter) return false;
                    document.dispatchEvent(
                        new CustomEvent('trigger-format', {
                            detail: {
                                content: view.state.doc.toString(),
                                fileType: info.fileType,
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

        const saveBinding = keymap.of([
            {
                key: 'Ctrl-s',
                run: (view) => {
                    if (isViewOnly) {
                        setShowSaveIndicator(true);
                        setTimeout(() => setShowSaveIndicator(false), 2000);
                        return true;
                    }
                    const content = view.state.doc.toString();
                    if (isEditingFile && currentFileId) void saveFileToStorage(content);
                    else if (!isEditingFile && documentId) void saveDocumentToLinkedFile(content);
                    return true;
                },
            },
        ]);

        return [formatBinding, saveBinding];
    };

    const buildCommentExtensions = (): Extension[] => {
        if (!enableComments || isViewOnly) return [];

        const commentBinding = keymap.of([
            {
                key: 'Alt-c',
                run: (view) => {
                    if (isViewOnly) return false;
                    const range = view.state.selection.main;
                    if (range.from === range.to) return false;
                    try {
                        document.dispatchEvent(
                            new CustomEvent('show-comment-modal', { detail: { selection: range } }),
                        );
                        return true;
                    } catch (error) {
                        console.error('Error in commentKeymap:', error);
                        return false;
                    }
                },
            },
        ]);

        return [commentBinding, commentSystemExtension];
    };

    // --- Yjs / collaboration connection ---
    useEffect(() => {
        if (!isDocumentSelected || isEditingFile || !documentId || !projectId) return;

        const collectionName = `yjs_${documentId}`;
        const collabOptions = getCollabOptions();
        const { doc, provider: collabProvider } = collabService.connect(
            projectId,
            collectionName,
            collabOptions ?? {},
        );
        setYDoc(doc);
        setProvider(collabProvider);

        const ytext = doc.getText('codemirror');
        ytextRef.current = ytext;
        undoManagerRef.current = new UndoManager(ytext);

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
            undoManagerRef.current = null;
            collabService.disconnect(projectId, collectionName);
            setYDoc(null);
            setProvider(null);
            ytextRef.current = null;
        };
    }, [projectId, documentId, isDocumentSelected, isEditingFile, user, getCollabOptions]);

    // --- Create / recreate EditorView ---
    useEffect(() => {
        if (!editorRef.current || (!ytextRef.current && !isEditingFile) || !isDocumentSelected) {
            return;
        }

        if (viewRef.current) {
            viewRef.current.destroy();
            viewRef.current = null;
        }

        const contentToUse = isEditingFile
            ? textContent
            : ytextRef.current?.toString() || '';

        const info = classifyFileType(fileName, contentToUse);
        const completionSources: CompletionSource[] = [];
        const extensions: Extension[] = [];

        if (info.isLatex || info.isTypst) {
            extensions.push(createListingsExtension(info.fileType as 'latex' | 'typst'));
        }

        extensions.push(...buildBaseExtensions());
        extensions.push(...buildLanguageExtension(info));

        if (fileName) {
            extensions.push(...getGenericLSPExtensionsForFile(fileName));
            completionSources.push(...getGenericLSPCompletionSources(fileName));
            extensions.push(createCodeActionsExtension(fileName));
        }

        if (info.isLatex || info.isTypst || info.isBib) {
            extensions.push(latexTypstBidiIsolates());
        }

        extensions.push(...buildLanguageSpecificExtensions(info, contentToUse, completionSources));

        if (info.isStructured) {
            extensions.push(autocompletion({
                override: completionSources.length > 0 ? completionSources : undefined,
                maxRenderedOptions: 20,
                closeOnBlur: false,
            }));
        } else {
            extensions.push(autocompletion());
        }

        if (isViewOnly) extensions.push(EditorState.readOnly.of(true));

        if (!isEditingFile && provider && ytextRef.current && undoManagerRef.current) {
            extensions.push(
                yCollab(ytextRef.current, provider.awareness, {
                    undoManager: undoManagerRef.current,
                }),
            );
            extensions.push(keymap.of(yUndoManagerKeymap));
        } else if (isEditingFile) {
            extensions.push(history());
            extensions.push(keymap.of(historyKeymap));
        }

        extensions.push(...buildCommentExtensions());
        extensions.push(...buildKeymapExtensions(info));

        const cachedHistory = isEditingFile && currentFileId
            ? fileHistoryCache.get(currentFileId)
            : undefined;

        let state: EditorState;
        if (cachedHistory) {
            try {
                state = EditorState.fromJSON(
                    {
                        doc: contentToUse,
                        selection: { ranges: [{ anchor: 0, head: 0 }], main: 0 },
                        history: cachedHistory,
                    },
                    { extensions },
                    { history: historyField },
                );
            } catch {
                fileHistoryCache.delete(currentFileId!);
                state = EditorState.create({ doc: contentToUse, extensions });
            }
        } else {
            state = EditorState.create({ doc: contentToUse, extensions });
        }

        try {
            const view = new EditorView({ state, parent: editorRef.current });
            viewRef.current = view;

            scheduleFilePathSync(info);

            setTimeout(() => {
                document.dispatchEvent(
                    new CustomEvent('editor-ready', {
                        detail: { fileId: currentFileId, documentId, isEditingFile },
                    }),
                );
            }, 50);

            if (info.isLatex || info.isTypst) {
                filePathCacheService.updateCache();
                updateLinkNavigationFileName(view, fileName);
            }
        } catch (error) {
            console.error('Error creating editor view:', error);
        }

        return () => {
            if (viewRef.current) {
                if (isEditingFile && currentFileId) {
                    const snapshot = viewRef.current.state.toJSON({ history: historyField });
                    fileHistoryCache.set(currentFileId, snapshot.history);
                }
                filePathCacheService.cleanup();
                viewRef.current.destroy();
                viewRef.current = null;
            }
        };
    }, [
        editorRef,
        yDoc,
        provider,
        undoManagerRef.current,
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

    useEffect(() => {
        if (!editorRef.current || !viewRef.current) return;
        return registerEditorClipboard(editorRef.current, viewRef);
    }, [editorRef, viewRef]);

    useEffect(() => {
        const autoSaveKey = isEditingFile ? currentFileId : documentId;

        if (autoSaveRef.current && autoSaveKey) {
            autoSaveManager.clearAutoSaver(autoSaveKey);
            autoSaveRef.current = null;
        }

        if (!autoSaveKey || isViewOnly || !getAutoSaveEnabled()) return;

        const autoSaveDelay = getAutoSaveDelay();

        const setupAutoSave = () => {
            if (!viewRef.current) {
                setTimeout(setupAutoSave, 100);
                return;
            }

            autoSaveRef.current = autoSaveManager.createAutoSaver(
                autoSaveKey,
                () => viewRef.current?.state?.doc?.toString() || '',
                {
                    enabled: true,
                    delay: autoSaveDelay,
                    onSave: async (_saveKey, content) => {
                        if (isEditingFile && currentFileId) await saveFileToStorage(content);
                        else if (!isEditingFile && documentId) await saveDocumentToLinkedFile(content);
                    },
                    onError: (error) => console.error('Auto-save failed:', error),
                },
            );
        };

        setupAutoSave();

        return () => {
            if (autoSaveKey) autoSaveManager.clearAutoSaver(autoSaveKey);
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

    useEffect(() => {
        if (!ytextRef.current || !isDocumentSelected || isEditingFile) return;

        return registerYjsBinding(ytextRef.current, {
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

    useEffect(() => {
        if (!viewRef.current) return;
        return registerEditorSearchHighlightEvents(viewRef);
    }, [viewRef]);

    useEffect(() => {
        if (!viewRef.current || !isDocumentSelected) return;

        return registerEditorEventHandlers(viewRef, {
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

    useEffect(() => {
        return () => {
            const autoSaveKey = isEditingFile ? currentFileId : documentId;
            if (autoSaveKey) {
                autoSaveManager.flushPendingSaves().catch(console.error);
                autoSaveManager.clearAutoSaver(autoSaveKey);
            }
        };
    }, [currentFileId, documentId, isEditingFile]);

    useEffect(() => {
        if (!isEditingFile || !currentFileId) return;

        const handleFileReloaded = async (e: Event) => {
            const { fileId } = (e as CustomEvent).detail;
            if (fileId !== currentFileId || !viewRef.current) return;
            const file = await fileStorageService.getFile(fileId);
            if (!file?.content) return;
            const content = typeof file.content === 'string'
                ? file.content
                : new TextDecoder().decode(file.content);
            viewRef.current.dispatch({
                changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
            });
        };

        document.addEventListener('file-reloaded', handleFileReloaded);
        return () => document.removeEventListener('file-reloaded', handleFileReloaded);
    }, [isEditingFile, currentFileId]);

    return { viewRef, isUpdatingRef, showSaveIndicator };
};