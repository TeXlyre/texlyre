// extras/viewers/bibtex/BibtexViewer.tsx
import { tidy } from "bib-editor";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import {
	DownloadIcon,
	OptionsIcon,
	SaveIcon,
} from "../../../src/components/common/Icons";
import {
	PluginControlGroup,
	PluginHeader,
} from "../../../src/components/common/PluginHeader";
import { usePluginFileInfo } from "../../../src/hooks/usePluginFileInfo";
import { useSettings } from "../../../src/hooks/useSettings";
import type { ViewerProps } from "../../../src/plugins/PluginInterface";
import { EditorLoader } from "../../../src/services/EditorLoader";
import { fileStorageService } from "../../../src/services/FileStorageService";
import { TidyOptionsPanel } from "./TidyOptionsPanel";
import { type TidyOptions, getPresetOptions } from "./tidyOptions";
import "./styles.css";
import { PLUGIN_NAME, PLUGIN_VERSION } from "./BibtexViewerPlugin";

const BibtexViewer: React.FC<ViewerProps> = ({ content, fileName, fileId }) => {
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

	const originalEditorRef = useRef<HTMLDivElement>(null);
	const processedEditorRef = useRef<HTMLDivElement>(null);

	const [options, setOptions] = useState<TidyOptions>(() =>
		getPresetOptions(tidyPreset),
	);

	const handleOriginalContentUpdate = (newContent: string) => {
		setBibtexContent(newContent);
		setHasChanges(true);
	};

	const handleProcessedContentUpdate = (newContent: string) => {
		setProcessedContent(newContent);
		setHasChanges(true);
	};

	const { viewRef: originalViewRef, showSaveIndicator: originalShowSaveIndicator } = EditorLoader(
		originalEditorRef,
		"bibtex-viewer",
		`${fileName}-original-editor`,
		true,
		bibtexContent,
		handleOriginalContentUpdate,
		() => [],
		() => ({}),
		() => {},
		true,
		false,
		fileName,
		fileId,
	);

	const { viewRef: processedViewRef, showSaveIndicator: processedShowSaveIndicator } = EditorLoader(
		processedEditorRef,
		"bibtex-viewer",
		`${fileName}-processed-editor`,
		true,
		processedContent,
		handleProcessedContentUpdate,
		() => [],
		() => ({}),
		() => {},
		true,
		false,
		fileName,
		undefined,
	);

	useEffect(() => {
		if (content instanceof ArrayBuffer) {
			try {
				const decoder = new TextDecoder("utf-8");
				const text = decoder.decode(content);

				setBibtexContent(text);
				setProcessedContent(text);
				setHasChanges(false);
				setError(null);

				if (autoTidy && text.trim()) {
					setTimeout(() => {
						processBibtexWithOptions(text, getPresetOptions(tidyPreset));
					}, 500);
				}
			} catch (error) {
				console.error(
					"BibtexViewer: Error decoding ArrayBuffer content:",
					error,
				);
				setBibtexContent("");
				setProcessedContent("");
				setError(
					`Failed to decode file content: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		} else if ((content as any) instanceof Uint8Array) {
			try {
				const decoder = new TextDecoder("utf-8");
				const text = decoder.decode(content);

				setBibtexContent(text);
				setProcessedContent(text);
				setHasChanges(false);
				setError(null);

				if (autoTidy && text.trim()) {
					setTimeout(() => {
						processBibtexWithOptions(text, getPresetOptions(tidyPreset));
					}, 500);
				}
			} catch (error) {
				console.error(
					"BibtexViewer: Error decoding Uint8Array content:",
					error,
				);
				setBibtexContent("");
				setProcessedContent("");
				setError(
					`Failed to decode file content: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		} else if (typeof content === "string") {
			setBibtexContent(content);
			setProcessedContent(content);
			setHasChanges(false);
			setError(null);

			if (autoTidy && (content as string).trim()) {
				setTimeout(() => {
					processBibtexWithOptions(content, getPresetOptions(tidyPreset));
				}, 500);
			}
		}
	}, [content, autoTidy, tidyPreset]);

	useEffect(() => {
		setOptions(getPresetOptions(tidyPreset));
	}, [tidyPreset]);

	const processBibtexWithOptions = async (
		content: string,
		tidyOptions: TidyOptions,
	) => {
		if (!content) return;

		setIsProcessing(true);
		setError(null);
		setWarnings([]);

		try {
			const result = await tidy(content, tidyOptions);
			setProcessedContent(result.bibtex);
			setWarnings(result.warnings || []);
			setHasChanges(true);
			if (autoTidy) {
				setCurrentView("processed");
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to process BibTeX file",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	const processBibtex = async () => {
		const currentOriginalContent = originalViewRef.current?.state?.doc?.toString() || bibtexContent;
		await processBibtexWithOptions(currentOriginalContent, options);
		setCurrentView("processed");
	};

	const handleSaveProcessed = async () => {
		if (!fileId) return;

		const currentEditorContent = processedViewRef.current?.state?.doc?.toString() || processedContent;

		if (!currentEditorContent.trim()) {
			console.warn("BibtexViewer: Attempted to save empty content");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			const encoder = new TextEncoder();
			const dataToSave = encoder.encode(currentEditorContent);

			await fileStorageService.updateFileContent(fileId, dataToSave.buffer);

			setBibtexContent(currentEditorContent);
			setProcessedContent("");
			setHasChanges(false);
			setCurrentView("original");
		} catch (error) {
			console.error("Error saving BibTeX file:", error);
			setError(
				`Failed to save file: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsSaving(false);
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

	const handleExport = (content: string, suffix = "") => {
		try {
			const currentEditorContent = (currentView === "original"
				? originalViewRef.current?.state?.doc?.toString()
				: processedViewRef.current?.state?.doc?.toString()) || "";
			const contentToExport = currentEditorContent || content;

			const blob = new Blob([contentToExport], {
				type: "text/plain;charset=utf-8",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${fileName.replace(/\.bib$/i, "") + suffix}.bib`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error exporting file:", error);
			setError(
				`Failed to export file: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const displayContent =
		currentView === "original" ? bibtexContent : processedContent;

	const tooltipInfo = [
		`Auto-tidy: ${autoTidy ? "enabled" : "disabled"}`,
		`Preset: ${tidyPreset}`,
		`Entries: ${bibtexContent.split("@").length - 1}`,
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
			</PluginControlGroup>

			<PluginControlGroup>
				{fileId && (
					<button
						onClick={() => {
							if (currentView === "original") {
								document.dispatchEvent(
									new CustomEvent("trigger-save", {
										detail: { fileId, isFile: true },
									}),
								);
							} else {
								handleSaveProcessed();
							}
						}}
						title={currentView === "original" ? "Save File (Ctrl+S)" : "Save Current View to File"}
						disabled={
							isSaving || (!bibtexContent.trim() && !processedContent.trim())
						}
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
							{warnings.map((warning, index) => (
								<div key={index} className="warning-item">
									{(warning as { message: string }).message}
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
								{isSaving && (
									<span className="processing-indicator"> (Saving...)</span>
								)}
							</div>

							<div
								ref={originalEditorRef}
								className="codemirror-editor-container"
								style={{ display: currentView === "original" ? "block" : "none" }}
							/>
							<div
								ref={processedEditorRef}
								className="codemirror-editor-container"
								style={{ display: currentView === "processed" ? "block" : "none" }}
							/>

							{originalShowSaveIndicator && currentView === "original" && (
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

export default BibtexViewer;
