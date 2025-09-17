// src/services/EditorLoader.ts
import { autocompletion, completionKeymap, type CompletionSource } from "@codemirror/autocomplete";
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
	bracketMatching,
	defaultHighlightStyle,
	foldGutter,
	foldKeymap,
	indentOnInput,
	syntaxHighlighting,
} from "@codemirror/language";
import {
	highlightSelectionMatches,
	search,
	searchKeymap,
} from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { type ViewUpdate, keymap } from "@codemirror/view";
import { lineNumbers } from "@codemirror/view";
import { EditorView } from "codemirror";
import { vim } from "@replit/codemirror-vim";
import { bibtex, bibtexCompletionSource } from "codemirror-lang-bib";
import { latex, latexCompletionSource } from "codemirror-lang-latex";
import { useEffect, useRef, useState } from "react";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";

import { pluginRegistry } from "../plugins/PluginRegistry";
import { commentSystemExtension } from "../extensions/codemirror/CommentExtension";
import { createFilePathAutocompleteExtension, setCurrentFilePath, refreshBibliographyCache } from "../extensions/codemirror/PathAndBibAutocompleteExtension.ts";
import { createLSPExtension, updateLSPPluginsInView, setCurrentFilePathInLSP } from "../extensions/codemirror/LSPExtension";
import { useAuth } from "../hooks/useAuth";
import { useEditor } from "../hooks/useEditor";
import { autoSaveManager } from "../utils/autoSaveUtils";
import { fileCommentProcessor } from "../utils/fileCommentProcessor.ts";
import { collabService } from "./CollabService";
import { fileStorageService } from "./FileStorageService";
import { filePathCacheService } from "./FilePathCacheService";

export const EditorLoader = (
	editorRef: React.RefObject<HTMLDivElement>,
	docUrl: string,
	documentId: string,
	isDocumentSelected: boolean,
	textContent: string,
	onUpdateContent: (content: string) => void,
	_parseComments: (text: string) => unknown[],
	addComment: (content: string) => unknown,
	updateComments: (content: string) => void,
	isEditingFile = false,
	isViewOnly = false,
	fileName?: string,
	currentFileId?: string,
	enableComments = false,
) => {
	const {
		getAutoSaveEnabled,
		getAutoSaveDelay,
		getLineNumbersEnabled,
		getSyntaxHighlightingEnabled,
	    getVimModeEnabled,
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
	const [provider, setProvider] = useState<WebrtcProvider | null>(null);

	const projectId = docUrl.startsWith("yjs:") ? docUrl.slice(4) : docUrl;

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

			// Refresh bibliography cache if this is a .bib file
			if (fileName?.endsWith('.bib') && viewRef.current) {
				refreshBibliographyCache(viewRef.current);
			}

			setShowSaveIndicator(true);
			setTimeout(() => setShowSaveIndicator(false), 1500);
		} catch (error) {
			console.error("Error saving file:", error);
		}
	};

	const saveDocumentToLinkedFile = async (content: string) => {
		if (!documentId || isEditingFile) return;
		try {
			const allFiles = await fileStorageService.getAllFiles(false);
			const linkedFile = allFiles.find(
				(file) => file.documentId === documentId,
			);
			if (linkedFile) {
				await fileStorageService.updateFileContent(linkedFile.id, content);

				// Refresh bibliography cache if this is a .bib file
				if (linkedFile.name.endsWith('.bib') && viewRef.current) {
					refreshBibliographyCache(viewRef.current);
				}

				setShowSaveIndicator(true);
				setTimeout(() => setShowSaveIndicator(false), 1500);
			}
		} catch (error) {
			console.error("Error saving document to linked file:", error);
		}
	};

	const getBasicSetupExtensions = (): Extension[] => {
		const extensions = [
			EditorView.theme({
				"&": {
					fontSize: "var(--editor-font-size, 14px)",
				},
				".cm-scroller": {
					fontSize: "var(--editor-font-size, 14px)",
				},
				".cm-content": {
					fontFamily: "var(--editor-font-family, monospace)",
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
			const highlightTheme = editorSettings.highlightTheme || "auto";

			let useDarkTheme = false;
			if (highlightTheme === "auto") {
				useDarkTheme =
					document.documentElement.getAttribute("data-theme") === "dark";
			} else if (highlightTheme === "dark") {
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
		return extensions;
	};

	const getLanguageExtension = (
		fileName?: string,
		content?: string,
	): Extension[] => {
		if (!getSyntaxHighlightingEnabled()) {
			return [];
		}

		if (!fileName) {
			if (
				content?.includes("@article") ||
				content?.includes("@book") ||
				content?.includes("@inproceedings")
			) {
				return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
			}
			return [latex({ autoCloseBrackets: false, enableAutocomplete: false })];
		}

		const ext = fileName.split(".").pop()?.toLowerCase();

		switch (ext) {
			case "tex":
			case "latex":
				return [latex({ autoCloseBrackets: false, enableAutocomplete: false })];
			case "bib":
			case "bibtex":
				return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
			case "md":
			case "markdown":
				return [markdown()];
			default:
				if (
					content?.includes("@article") ||
					content?.includes("@book") ||
					content?.includes("@inproceedings")
				) {
					return [bibtex({ autoCloseBrackets: false, enableAutocomplete: false })];
				}
				return [latex({ autoCloseBrackets: false, enableAutocomplete: false })];
		}
	};

	const getCursorTrackingExtension = (): Extension => {
		let cursorUpdateTimeout: NodeJS.Timeout | null = null;
		
		return EditorView.updateListener.of((update: ViewUpdate) => {
			if (update.docChanged && autoSaveRef.current) {
			autoSaveRef.current();
			}
			
			if (update.selectionSet) {
			if (cursorUpdateTimeout) {
				clearTimeout(cursorUpdateTimeout);
			}
			
			cursorUpdateTimeout = setTimeout(() => {
				if (update.view && update.view.state) {
				const pos = update.view.state.selection.main.head;
				const line = update.view.state.doc.lineAt(pos).number;
				
				document.dispatchEvent(new CustomEvent('editor-cursor-update', {
					detail: { 
					line, 
					position: pos,
					fileId: currentFileId,
					documentId: documentId,
					isEditingFile
					}
				}));
				}
			}, 200);
			}
		});
	};
	
	useEffect(() => {
		if (!isDocumentSelected || isEditingFile || !documentId || !projectId) {
			return;
		}

		const collectionName = `yjs_${documentId}`;
		const collabOptions = getCollabOptions();
		const { doc, provider } = collabService.connect(projectId, collectionName, collabOptions);
		setYDoc(doc);
		setProvider(provider);

		const ytext = doc.getText("codemirror");
		ytextRef.current = ytext;

		if (user) {
			collabService.setUserInfo(projectId, collectionName, {
				id: user.id,
				username: user.username,
				name: user.name,
				color: user.color,
				colorLight: user.colorLight,
				passwordHash: "",
				createdAt: 0,
			});
		}

		return () => {
			collabService.disconnect(projectId, collectionName);
			setYDoc(null);
			setProvider(null);
			ytextRef.current = null;
		};
	}, [projectId, documentId, isDocumentSelected, isEditingFile, user, getCollabOptions]);

	useEffect(() => {
		if (
			!editorRef.current ||
			(!ytextRef.current && !isEditingFile) ||
			!isDocumentSelected
		) {
			return;
		}

		if (viewRef.current) {
			viewRef.current.destroy();
			viewRef.current = null;
		}

		const extensions = [
			...getBasicSetupExtensions(),
			...getLanguageExtension(fileName, textContent),
		];

		// Determine file types for enhanced completion
		const isLatexFile = fileName?.endsWith('.tex') || (!fileName && textContent?.includes('\\'));
		const isBibFile = fileName?.endsWith('.bib') || fileName?.endsWith('.bibtex') || (!fileName && (textContent?.includes('@article') || textContent?.includes('@book') || textContent?.includes('@inproceedings')));

		if (isLatexFile || isBibFile) {
			const fileExtension = fileName?.split('.').pop()?.toLowerCase() || (isLatexFile ? 'tex' : 'bib');
			const allLSPPlugins = pluginRegistry.getLSPPluginsForFileType(fileExtension);

			// Filter to only enabled plugins
			const enabledPluginIds = getEnabledLSPPlugins();
			const availableLSPPlugins = allLSPPlugins.filter(plugin =>
				enabledPluginIds.includes(plugin.id)
			);

			const completionSources: CompletionSource[] = [];

			// Set up LSP integration with file path context
			if (availableLSPPlugins.length > 0) {
				const [lspField, lspPlugin, lspCompletionSource] = createLSPExtension();
				extensions.push(lspField, lspPlugin);
				completionSources.push(lspCompletionSource);

				// Update LSP plugins after a short delay
				setTimeout(() => {
					if (viewRef.current) {
						updateLSPPluginsInView(viewRef.current, availableLSPPlugins);

						// Set current file path for ALL LSP plugins
						if (isEditingFile && currentFileId) {
							fileStorageService.getFile(currentFileId).then(file => {
								if (file && viewRef.current) {
									setCurrentFilePathInLSP(viewRef.current, file.path);

									// Update file path in individual LSP plugins
									availableLSPPlugins.forEach(plugin => {
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

			if (isLatexFile) {
				// Get current file path for relative path calculations
				let currentFilePath = '';
				if (isEditingFile && currentFileId) {
					const getCurrentFilePath = async () => {
						const file = await fileStorageService.getFile(currentFileId);
						return file?.path || '';
					};

					getCurrentFilePath().then(path => {
						currentFilePath = path;
					});
				}

				// Create enhanced file path and bibliography autocompletion
				const [stateExtensions, filePathPlugin, enhancedCompletionSource] = createFilePathAutocompleteExtension(currentFilePath);
				extensions.push(stateExtensions, filePathPlugin);

				// Add both enhanced completion (includes bibliography) and latex completion
				completionSources.push(enhancedCompletionSource);
				completionSources.push(latexCompletionSource(true));
			} else if (isBibFile) {
				// For .bib files, we still want enhanced completion but with bibtex base completion
				const [stateExtensions, filePathPlugin, enhancedCompletionSource] = createFilePathAutocompleteExtension('');
				extensions.push(stateExtensions, filePathPlugin);

				completionSources.push(enhancedCompletionSource);
				completionSources.push(bibtexCompletionSource);
			}

			// Update file paths after view creation
			if (isEditingFile && currentFileId) {
				setTimeout(async () => {
					const file = await fileStorageService.getFile(currentFileId);
					if (file && viewRef.current) {
						setCurrentFilePath(viewRef.current, file.path);
						filePathCacheService.updateCurrentFilePath(file.path);

						// Update LSP plugins with file path
						availableLSPPlugins.forEach(plugin => {
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

			// Set up autocompletion with prioritized sources
			extensions.push(
				autocompletion({
					override: completionSources,
					maxRenderedOptions: 20,
					closeOnBlur: false, // Keep open for better bibliography browsing
				})
			);
		} else {
			extensions.push(autocompletion());
		}

		if (isViewOnly) extensions.push(EditorState.readOnly.of(true));

		if (!isEditingFile && provider && ytextRef.current) {
			extensions.push(keymap.of(yUndoManagerKeymap));
			extensions.push(yCollab(ytextRef.current, provider.awareness));
		}

		// Only add comment system if comments are enabled
		if (enableComments && !isViewOnly) {
			const commentKeymap = keymap.of([
				{
					key: "Alt-c",
					run: (view) => {
						if (isViewOnly) return false;
						const selection = view.state.selection;
						const primaryRange = selection.main;
						if (primaryRange.from !== primaryRange.to) {
							try {
								document.dispatchEvent(
									new CustomEvent("show-comment-modal", {
										detail: { selection: primaryRange },
									})
								);
								return true;
							} catch (error) {
								console.error("Error in commentKeymap:", error);
							}
						}
						return false;
					},
				},
			]);

			extensions.push(commentKeymap);
			extensions.push(commentSystemExtension);
		}

		const saveKeymap = keymap.of([
			{
				key: "Ctrl-s",
				run: (view) => {
					if (isViewOnly) {
						setShowSaveIndicator(true);
						setTimeout(() => setShowSaveIndicator(false), 2000);
						return true;
					}

					const content = view.state.doc.toString();
					if (isEditingFile && currentFileId) {
						saveFileToStorage(content);
					} else if (!isEditingFile && documentId) {
						saveDocumentToLinkedFile(content);
					}
					return true;
				},
			},
		]);
		extensions.push(saveKeymap);

		const state = EditorState.create({
			doc: isEditingFile ? textContent : ytextRef.current?.toString(),
			extensions,
		});

		try {
			const view = new EditorView({ state, parent: editorRef.current });
			viewRef.current = view;
			
			// Emit editor ready event
			setTimeout(() => {
				document.dispatchEvent(new CustomEvent('editor-ready', {
				detail: {
					fileId: currentFileId,
					documentId: documentId,
					isEditingFile: isEditingFile
				}
				}));
			}, 50);

			// Update file path cache for LaTeX files
			if (isLatexFile) {
				filePathCacheService.updateCache();
			}

			// Set up content change handler for file editing
			if (isEditingFile && !isViewOnly) {
				const handleInput = () => {
					if (!isUpdatingRef.current && viewRef.current) {
						const content = viewRef.current.state.doc.toString();
						isUpdatingRef.current = true;
						try {
							onUpdateContent(content);
							if (enableComments) {
								updateComments(content);
							}
							if (autoSaveRef.current) autoSaveRef.current();
						} finally {
							isUpdatingRef.current = false;
						}
					}
				};
				view.dom.addEventListener("input", handleInput);
				return () => view.dom.removeEventListener("input", handleInput);
			}

		} catch (error) {
			console.error("Error creating editor view:", error);
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
	]);

	// Event listener for bibliography cache updates
	useEffect(() => {
		const handleFileTreeRefresh = () => {
			if (viewRef.current) {
				refreshBibliographyCache(viewRef.current);
			}
		};

		document.addEventListener('refresh-file-tree', handleFileTreeRefresh);

		return () => {
			document.removeEventListener('refresh-file-tree', handleFileTreeRefresh);
		};
	}, []);

	useEffect(() => {
		if (!viewRef.current || !editorRef.current) return;

		const handleCopy = (event: ClipboardEvent) => {
			const view = viewRef.current;
			if (!view) return;

			const selection = view.state.selection;
			const primaryRange = selection.main;

			if (primaryRange.from !== primaryRange.to) {
				const selectedText = view.state.doc.sliceString(
					primaryRange.from,
					primaryRange.to,
				);
				const cleanedText =
					fileCommentProcessor.processTextSelection(selectedText);

				event.clipboardData?.setData("text/plain", cleanedText);
				event.preventDefault();
			}
		};

		const editorElement = editorRef.current;
		editorElement.addEventListener("copy", handleCopy);

		return () => {
			editorElement.removeEventListener("copy", handleCopy);
		};
	}, [editorRef, viewRef]);

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
						viewRef.current?.state?.doc?.toString() || "";
					return currentEditorContent;
				},
				{
					enabled: true,
					delay: autoSaveDelay,
					onSave: async (saveKey, content) => {
						if (isEditingFile && currentFileId) {
							const encoder = new TextEncoder();
							const contentBuffer = encoder.encode(content).buffer;
							await fileStorageService.updateFileContent(
								currentFileId,
								contentBuffer,
							);
						} else if (!isEditingFile && documentId) {
							await saveDocumentToLinkedFile(content);
						}
						setShowSaveIndicator(true);
						setTimeout(() => setShowSaveIndicator(false), 1500);
					},
					onError: (error) => {
						console.error("Auto-save failed:", error);
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

	useEffect(() => {
		if (!viewRef.current || !isDocumentSelected) return;

		const handleCommentResponseAdded = (event: Event) => {
			const customEvent = event as CustomEvent;
			if (!viewRef.current || isViewOnly) return;

			try {
				const { commentId, rawComment } = customEvent.detail;

				const currentContent = viewRef.current.state.doc.toString();

				const openTagStart = currentContent.indexOf(
					`<### comment id: ${commentId}`,
				);
				if (openTagStart === -1) return;

				const openTagEnd = currentContent.indexOf("###>", openTagStart) + 4;

				const closeTagStart = currentContent.indexOf(
					`</### comment id: ${commentId}`,
					openTagEnd,
				);
				if (closeTagStart === -1) return;

				const closeTagEnd = currentContent.indexOf("###>", closeTagStart) + 4;

				const commentedText = currentContent.slice(openTagEnd, closeTagStart);

				const newContent = `${rawComment.openTag}${commentedText}${rawComment.closeTag}`;

				const transaction = viewRef.current.state.update({
					changes: [
						{
							from: openTagStart,
							to: closeTagEnd,
							insert: newContent,
						},
					],
				});

				viewRef.current.dispatch(transaction);

				setTimeout(() => {
					if (viewRef.current) {
						const finalContent = viewRef.current.state.doc.toString();
						updateComments(finalContent);
					}
				}, 10);
			} catch (error) {
				console.error("Error processing comment response:", error);
			}
		};

		const handleCommentDelete = (event: Event) => {
			const customEvent = event as CustomEvent;
			if (!viewRef.current || isViewOnly) return;

			try {
				const { openTagStart, openTagEnd, closeTagStart, closeTagEnd } =
					customEvent.detail;

				const transaction = viewRef.current.state.update({
					changes: [
						{ from: closeTagStart, to: closeTagEnd },
						{ from: openTagStart, to: openTagEnd },
					],
				});

				viewRef.current.dispatch(transaction);

				setTimeout(() => {
					if (viewRef.current) {
						const updatedContent = viewRef.current.state.doc.toString();
						updateComments(updatedContent);
					}
				}, 50);
			} catch (error) {
				console.error("Error processing comment deletion:", error);
			}
		};

		const handleCommentUpdate = (event: Event) => {
			const customEvent = event as CustomEvent;
			if (!viewRef.current || isViewOnly) return;

			try {
				const {
					openTagStart,
					openTagEnd,
					closeTagStart,
					closeTagEnd,
					rawComment,
				} = customEvent.detail;

				const transaction = viewRef.current.state.update({
					changes: [
						{
							from: closeTagStart,
							to: closeTagEnd,
							insert: rawComment.closeTag,
						},
						{ from: openTagStart, to: openTagEnd, insert: rawComment.openTag },
					],
				});

				viewRef.current.dispatch(transaction);

				setTimeout(() => {
					if (viewRef.current) {
						const updatedContent = viewRef.current.state.doc.toString();
						updateComments(updatedContent);
					}
				}, 50);
			} catch (error) {
				console.error("Error processing comment update:", error);
			}
		};

		const handleGotoLine = (event: Event) => {
			const customEvent = event as CustomEvent;
			if (!viewRef.current) return;

			try {
				const { line, fileId, filePath, documentId: eventDocId, tabId } = customEvent.detail;

				if (
					isEditingFile &&
					fileId &&
					currentFileId &&
					currentFileId !== fileId
				) {
					return;
				}

				if (!isEditingFile && filePath && !filePath.includes(documentId)) {
					return;
				}

				if (tabId) {
					// This is a tab-specific goto request
					const isTargetFile = isEditingFile && fileId && currentFileId === fileId;
					const isTargetDoc = !isEditingFile && eventDocId && documentId === eventDocId;
					
					if (!isTargetFile && !isTargetDoc) return;
				}

				if (line && line > 0) {
					const view = viewRef.current;
					const doc = view.state.doc;

					const lineNumber = Math.max(1, Math.min(line, doc.lines)) - 1;
					const linePos = doc.line(lineNumber + 1).from;

					view.dispatch({
						selection: { anchor: linePos, head: linePos },
						effects: [EditorView.scrollIntoView(linePos, { y: "center" })],
					});

					view.focus();
				}
			} catch (error) {
				console.error("Error in Codemirror line navigation:", error);
			}
		};

		const handleFileSaved = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { fileId: eventFileId } = customEvent.detail;

			if (eventFileId === currentFileId && isEditingFile) {
				setShowSaveIndicator(true);
				setTimeout(() => setShowSaveIndicator(false), 1500);
			}
		};

		const handleTriggerSave = (event: Event) => {
			const customEvent = event as CustomEvent;
			const {
				fileId: eventFileId,
				documentId: eventDocumentId,
				isFile,
			} = customEvent.detail;

			if (!viewRef.current || isViewOnly) return;

			const content = viewRef.current.state.doc.toString();

			if (isFile && eventFileId === currentFileId && isEditingFile) {
				saveFileToStorage(content);
			} else if (!isFile && eventDocumentId === documentId && !isEditingFile) {
				saveDocumentToLinkedFile(content);
			}
		};

		document.addEventListener(
			"comment-response-added",
			handleCommentResponseAdded,
		);
		document.addEventListener("comment-delete", handleCommentDelete);
		document.addEventListener("comment-update", handleCommentUpdate);
		document.addEventListener("codemirror-goto-line", handleGotoLine);
		document.addEventListener("file-saved", handleFileSaved);
		document.addEventListener("trigger-save", handleTriggerSave);

		return () => {
			document.removeEventListener(
				"comment-response-added",
				handleCommentResponseAdded,
			);
			document.removeEventListener("comment-delete", handleCommentDelete);
			document.removeEventListener("comment-update", handleCommentUpdate);
			document.removeEventListener("codemirror-goto-line", handleGotoLine);
			document.removeEventListener("file-saved", handleFileSaved);
			document.removeEventListener("trigger-save", handleTriggerSave);
		};
	}, [
		viewRef,
		isDocumentSelected,
		isViewOnly,
		updateComments,
		isEditingFile,
		currentFileId,
		documentId,
	]);

	useEffect(() => {
		if (!ytextRef.current || !isDocumentSelected || isEditingFile) return;

		const yTextInstance = ytextRef.current;
		let hasEmittedReady = false;

		const observer = () => {
			if (isUpdatingRef.current) return;
			const content = yTextInstance.toString() || "";
			isUpdatingRef.current = true;
			try {
				onUpdateContent(content);
				if (enableComments) {
					updateComments(content);
				}
				if (autoSaveRef.current) autoSaveRef.current();

				// Emit ready event once content is available for documents
				if (!hasEmittedReady && content && viewRef.current) {
					hasEmittedReady = true;
					setTimeout(() => {
						document.dispatchEvent(new CustomEvent('editor-ready-yjs', {
							detail: {
								fileId: currentFileId,
								documentId: documentId,
								isEditingFile: isEditingFile
							}
						}));
					}, 50);
				}
			} finally {
				isUpdatingRef.current = false;
			}
		};

		yTextInstance.observe(observer);

		return () => {
			yTextInstance.unobserve(observer);
			isUpdatingRef.current = false;
		};
	}, [
		ytextRef,
		isDocumentSelected,
		onUpdateContent,
		updateComments,
		isEditingFile,
		enableComments,
		currentFileId,
		documentId,
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

	return { viewRef, isUpdatingRef, showSaveIndicator };
};