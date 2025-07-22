// extras/collaborative_viewers/bibtex/BibtexCollaborativeViewer.tsx
import { tidy } from "bib-editor";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import {
	DownloadIcon,
	OptionsIcon,
	SaveIcon,
	ViewIcon,
} from "../../../src/components/common/Icons";
import {
	PluginControlGroup,
	PluginHeader,
} from "../../../src/components/common/PluginHeader";
import { usePluginFileInfo } from "../../../src/hooks/usePluginFileInfo";
import { useSettings } from "../../../src/hooks/useSettings";
import type { CollaborativeViewerProps } from "../../../src/plugins/PluginInterface";
import { EditorLoader } from "../../../src/services/EditorLoader";
import { fileStorageService } from "../../../src/services/FileStorageService";
import { TidyOptionsPanel } from "../../viewers/bibtex/TidyOptionsPanel";
import {
	type TidyOptions,
	getPresetOptions,
} from "../../viewers/bibtex/tidyOptions";
import { BibtexTableView } from "../../viewers/bibtex/BibtexTableView";
import { BibtexParser } from "../../viewers/bibtex/BibtexParser";
import type { BibtexEntry } from "../../viewers/bibtex/BibtexParser";
import "../../viewers/bibtex/styles.css";
import { PLUGIN_NAME, PLUGIN_VERSION } from "./BibtexCollaborativeViewerPlugin";

const BibtexCollaborativeViewer: React.FC<CollaborativeViewerProps> = ({
	content,
	fileName,
	fileId,
	docUrl,
	documentId,
	isDocumentSelected,
	onUpdateContent,
	parseComments,
	addComment,
	updateComments,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const autoTidy =
		(getSetting("bibtex-viewer-auto-tidy")?.value as boolean) ?? true;
	const tidyPreset =
		(getSetting("bibtex-viewer-tidy-options")?.value as
			| "minimal"
			| "standard"
			| "strict") ?? "standard";

	const [bibtexContent, setBibtexContent] = useState<string>("");
	const [processedContent, setProcessedContent] = useState<string>("");
	const [isProcessing, setIsProcessing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [_hasChanges, setHasChanges] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<unknown[]>([]);
	const [showSidebar, setShowSidebar] = useState(true);
	const [currentView, setCurrentView] = useState<"original" | "processed">(
		"original",
	);
	const [viewMode, setViewMode] = useState<"editor" | "table">("editor");

	const [processedParsedEntries, setProcessedParsedEntries] = useState<BibtexEntry[]>([]);
	const [updateCounter, setUpdateCounter] = useState(0);

	const editorRef = useRef<HTMLDivElement>(null);
	const [options, setOptions] = useState<TidyOptions>(() =>
		getPresetOptions(tidyPreset),
	);
	const _activeContent =
		currentView === "original" ? bibtexContent : processedContent;

	const initialContentRef = useRef<string>(
		typeof content === "string"
			? content
			: content instanceof ArrayBuffer
				? new TextDecoder("utf-8").decode(content)
				: "",
	);

	const parseContent = (content: string) => {
		try {
			return BibtexParser.parse(content);
		} catch (error) {
			console.warn("Failed to parse BibTeX content:", error);
			return [];
		}
	};

	const handleContentUpdate = (newContent: string) => {
		if (currentView === "original") {
			setBibtexContent(newContent);
			setHasChanges(true);
			onUpdateContent(newContent);
		} else {
			setProcessedContent(newContent);
			setProcessedParsedEntries(parseContent(newContent));
			setUpdateCounter(prev => prev + 1);
			setHasChanges(true);
		}
	};

	const handleSingleTableEntryUpdate = (updatedEntry: BibtexEntry) => {
		const newContent = BibtexParser.updateEntryInContent(processedContent, updatedEntry);
		setProcessedContent(newContent);

		const updatedParsedEntries = processedParsedEntries.map(entry =>
			entry.originalIndex === updatedEntry.originalIndex ? updatedEntry : entry
		);
		setProcessedParsedEntries(updatedParsedEntries);

		if (viewRef.current) {
			const position = BibtexParser.findEntryPosition(processedContent, updatedEntry);
			if (position) {
				const newEntryContent = BibtexParser.serializeEntry(updatedEntry);
				viewRef.current.dispatch({
					changes: {
						from: position.start,
						to: position.end,
						insert: newEntryContent
					}
				});
			}
		}

		setUpdateCounter(prev => prev + 1);
		setHasChanges(true);
	};

	const handleTableEntryUpdate = (updatedEntries: BibtexEntry[]) => {
		const newContent = BibtexParser.serialize(updatedEntries);
		setProcessedContent(newContent);
		setProcessedParsedEntries(updatedEntries);

		if (viewRef.current) {
			viewRef.current.dispatch({
				changes: { from: 0, to: viewRef.current.state.doc.length, insert: newContent }
			});
		}

		setUpdateCounter(prev => prev + 1);
		setHasChanges(true);
	};

	const { viewRef, showSaveIndicator } =
		currentView === "original"
			? EditorLoader(
					editorRef,
					docUrl,
					documentId,
					isDocumentSelected,
					initialContentRef.current,
					handleContentUpdate,
					parseComments || (() => []),
					addComment || (() => ({ openTag: "", closeTag: "", commentId: "" })),
					updateComments || (() => {}),
					false,
					false,
					fileName,
					undefined,
					false,
				)
			: EditorLoader(
					editorRef,
					"bibtex-viewer",
					`${documentId}-processed`,
					true,
					processedContent,
					handleContentUpdate,
					() => [],
					() => ({ openTag: "", closeTag: "", commentId: "" }),
					() => {},
					true,
					false,
					fileName,
					undefined,
					false,
				);

	useEffect(() => {
		let text = "";
		if (content instanceof ArrayBuffer) {
			try {
				text = new TextDecoder("utf-8").decode(content);
			} catch (e) {
				console.error("BibtexCollaborativeViewer: Error decoding content:", e);
				setError("Failed to decode file content");
				return;
			}
		} else if (typeof content === "string") {
			text = content;
		}
		setBibtexContent(text);
		setProcessedContent(text);
		setProcessedParsedEntries(parseContent(text));
		setHasChanges(false);
		setError(null);

		if (autoTidy && text.trim()) {
			setTimeout(() => {
				processBibtexWithOptions(text, getPresetOptions(tidyPreset));
			}, 500);
		}
	}, [content, autoTidy, tidyPreset]);

	// Sync table with current editor content when switching to table view (processed only)
	useEffect(() => {
		if (viewMode === "table" && currentView === "processed") {
			console.log('Switching to table view - syncing with processed editor content');

			if (viewRef.current) {
				const currentEditorContent = viewRef.current.state?.doc?.toString();
				if (currentEditorContent && currentEditorContent !== processedContent) {
					console.log('Processed editor content differs from state, updating...');
					setProcessedContent(currentEditorContent);
					const newParsed = parseContent(currentEditorContent);
					setProcessedParsedEntries(newParsed);
					setUpdateCounter(prev => prev + 1);
				}
			}
		}
	}, [viewMode, currentView, processedContent]);

	const processBibtexWithOptions = async (
		input: string,
		tidyOptions: TidyOptions,
	) => {
		if (!input) return;
		setIsProcessing(true);
		setError(null);
		setWarnings([]);
		try {
			const result = await tidy(input, tidyOptions);
			setProcessedContent(result.bibtex);
			setProcessedParsedEntries(parseContent(result.bibtex));
			setWarnings(result.warnings || []);
			setHasChanges(true);
			if (autoTidy) setCurrentView("processed");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to process BibTeX file",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	const processBibtex = async () => {
		await processBibtexWithOptions(bibtexContent, options);
		setCurrentView("processed");
	};

	const handleSaveProcessed = async () => {
		if (!fileId || currentView !== "processed") return;

		const currentEditorContent = viewRef.current?.state?.doc?.toString() || "";
		const contentToSave = currentEditorContent.trim()
			? currentEditorContent
			: processedContent;
		if (!contentToSave.trim()) return;

		setIsSaving(true);
		setError(null);

		try {
			const encoder = new TextEncoder();
			await fileStorageService.updateFileContent(
				fileId,
				encoder.encode(contentToSave),
			);

			initialContentRef.current = contentToSave;

			setBibtexContent(contentToSave);
			setProcessedContent("");
			setProcessedParsedEntries([]);

			setCurrentView("original");

			setTimeout(() => {
				onUpdateContent(contentToSave);

				setTimeout(() => {
					if (viewRef.current?.state) {
						const view = viewRef.current;
						const currentDoc = view.state.doc.toString();

						if (currentDoc !== contentToSave) {
							try {
								view.dispatch({
									changes: {
										from: 0,
										to: view.state.doc.length,
										insert: contentToSave,
									},
								});
							} catch (error) {
								console.error("Error updating editor content:", error);
							}
						}
					}
					setHasChanges(false);
				}, 200);
			}, 100);
		} catch (e) {
			console.error("Error saving processed BibTeX file:", e);
			setError(
				`Failed to save file: ${e instanceof Error ? e.message : "Unknown error"}`,
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleExport = (text: string, suffix = "") => {
		try {
			const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${fileName.replace(/\.bib$/i, "") + suffix}.bib`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (e) {
			console.error("Error exporting file:", e);
			setError(
				`Failed to export file: ${e instanceof Error ? e.message : "Unknown error"}`,
			);
		}
	};

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey && event.key === 's' && currentView === "processed") {
				event.preventDefault();
				handleSaveProcessed();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [currentView, handleSaveProcessed]);

	const displayContent =
		currentView === "original" ? bibtexContent : processedContent;

	const tooltipInfo = [
		`Auto-tidy: ${autoTidy ? "enabled" : "disabled"}`,
		`Preset: ${tidyPreset}`,
		`Entries: ${bibtexContent.split("@").length - 1}`,
		"Collaborative Mode: Active",
		`MIME Type: ${fileInfo.mimeType || "text/x-bibtex"}`,
		`Size: ${fileInfo.fileSize ? `${Math.round(fileInfo.fileSize / 1024)} KB` : "Unknown"}`,
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button
					className={`${showSidebar ? "active" : ""}`}
					onClick={() => setShowSidebar(!showSidebar)}
					title="Toggle Options Panel"
				>
					<OptionsIcon />
				</button>
				{/* Only show table view toggle for processed view */}
				{currentView === "processed" && (
					<button
						className={`${viewMode === "table" ? "active" : ""}`}
						onClick={() => setViewMode(viewMode === "editor" ? "table" : "editor")}
						title={`Switch to ${viewMode === "editor" ? "Table" : "Editor"} View`}
					>
						<ViewIcon />
					</button>
				)}
			</PluginControlGroup>

			<PluginControlGroup>
				{currentView === "original" && (
					<button
						onClick={() => {
							document.dispatchEvent(
								new CustomEvent("trigger-save", {
									detail: { documentId, isFile: false },
								}),
							);
						}}
						title="Save Document (Ctrl+S)"
						className="control-button"
					>
						<SaveIcon />
					</button>
				)}
				{fileId && currentView === "processed" && (
					<button
						onClick={handleSaveProcessed}
						title="Save Processed to Original"
						disabled={isSaving || !processedContent.trim()}
					>
						<SaveIcon />
					</button>
				)}
				<button
					onClick={() =>
						handleExport(
							displayContent,
							currentView === "original" ? "_original" : "_tidied",
						)
					}
					title="Download Current View"
				>
					<DownloadIcon />
				</button>
			</PluginControlGroup>
		</>
	);

	return (
		<div className="bibtex-viewer-container">
			<PluginHeader
				fileName={fileInfo.fileName}
				filePath={fileInfo.filePath}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
				onNavigateToLinkedFile={() => {
					if (fileId && fileInfo.filePath) {
						document.dispatchEvent(
							new CustomEvent("navigate-to-linked-file", {
								detail: {
									filePath: fileInfo.filePath,
									fileId: fileId,
								},
							}),
						);
					}
				}}
				linkedFileInfo={{
					fileName: fileInfo.fileName,
					filePath: fileInfo.filePath,
					fileId: fileId,
				}}
			/>

			<div className="bibtex-viewer-main">
				{showSidebar && (
					<TidyOptionsPanel
						options={options}
						onOptionsChange={setOptions}
						onResetToDefaults={() => setOptions(getPresetOptions("standard"))}
						onProcessBibtex={processBibtex}
						isProcessing={isProcessing}
					/>
				)}

				<div className="bibtex-content-area">
					{error && <div className="bib-error-message">{error}</div>}

					{warnings.length > 0 && (
						<div className="warnings-container">
							<h5>Warnings:</h5>
							{warnings.map((w, i) => (
								<div key={i} className="warning-item">
									{(w as { message: string }).message}
								</div>
							))}
						</div>
					)}

					<div className="editor-containers">
						<div className="editor-container" style={{ position: "relative" }}>
							<div className="editor-header">
								<div className="view-tabs">
									<button
										className={`tab-button ${currentView === "original" ? "active" : ""}`}
										onClick={() => setCurrentView("original")}
									>
										Original
									</button>
									<button
										className={`tab-button ${currentView === "processed" ? "active" : ""}`}
										onClick={() => setCurrentView("processed")}
										disabled={!processedContent.trim()}
									>
										Processed
									</button>
								</div>
								{currentView === "processed" && processedContent.trim() && (
									<div className="processed-save-notice">
										<span>Not saved automatically. Click the <SaveIcon/> <strong>Save</strong> button or <strong>Ctrl+S</strong></span>
									</div>
								)}
								{isProcessing && (
									<span className="processing-indicator"> (Processing...)</span>
								)}
								{isSaving && currentView === "processed" && (
									<span className="processing-indicator"> (Saving...)</span>
								)}
							</div>

							{/* Always show editor, conditionally show table for processed view only */}
							<div
								ref={editorRef}
								className="codemirror-editor-container"
								style={{
									display: currentView === "processed" && viewMode === "table" ? "none" : "block"
								}}
							/>

							{/* Only show table for processed view */}
							{currentView === "processed" && viewMode === "table" && (
								<BibtexTableView
									key={`processed-${updateCounter}`}
									entries={processedParsedEntries}
									onEntriesChange={handleTableEntryUpdate}
									onSingleEntryChange={handleSingleTableEntryUpdate}
								/>
							)}

							{showSaveIndicator && currentView === "original" && (
								<div className="save-indicator">
									<span>Saved</span>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default BibtexCollaborativeViewer;