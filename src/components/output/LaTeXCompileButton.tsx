// src/components/output/LaTeXCompileButton.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";

import PdfWindowToggleButton from "./PdfWindowToggleButton";
import { useCollab } from "../../hooks/useCollab";
import { useFileTree } from "../../hooks/useFileTree";
import { useLaTeX } from "../../hooks/useLaTeX";
import type { DocumentList } from "../../types/documents";
import type { FileNode } from "../../types/files";
import { isTemporaryFile } from "../../utils/fileUtils";
import {ChevronDownIcon, ClearCompileIcon, PlayIcon, StopIcon, TrashIcon} from "../common/Icons";

interface LaTeXCompileButtonProps {
	className?: string;
	selectedDocId?: string | null;
	documents?: Array<{ id: string; name: string }>;
	onNavigateToLinkedFile?: () => void;
	onExpandLatexOutput?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null;
	shouldNavigateOnCompile?: boolean;
	useSharedSettings?: boolean;
	docUrl?: string;
}

const LaTeXCompileButton: React.FC<LaTeXCompileButtonProps> = ({
	className = "",
	selectedDocId,
	documents,
	onNavigateToLinkedFile,
	onExpandLatexOutput,
	linkedFileInfo,
	shouldNavigateOnCompile = false,
	useSharedSettings = false,
	docUrl,
}) => {
	const {
		isCompiling,
		compileDocument,
		stopCompilation,
		latexEngine,
		setLatexEngine,
		clearCache,
		compileWithClearCache,
	} = useLaTeX();
	const { selectedFileId, getFile, fileTree } = useFileTree();
	const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
	const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
	const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
	const [isChangingEngine, setIsChangingEngine] = useState(false);
	const compileButtonRef = useRef<{ clearAndCompile: () => void }>();
	const dropdownRef = useRef<HTMLDivElement>(null);

	const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
	const projectEngine = useSharedSettings ? doc?.projectMetadata?.latexEngine : undefined;
	const effectiveEngine = projectEngine || latexEngine;
	const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;

	useEffect(() => {
		const findTexFiles = (nodes: FileNode[]): string[] => {
			const texFiles: string[] = [];
			for (const node of nodes) {
				if (node.type === "file" && node.path.endsWith(".tex") && !isTemporaryFile(node.path)) {
					texFiles.push(node.path);
				}
				if (node.children) {
					texFiles.push(...findTexFiles(node.children));
				}
			}
			return texFiles;
		};

		const allTexFiles = findTexFiles(fileTree);
		setAvailableTexFiles(allTexFiles);

		const findMainFile = async () => {
			if (
				selectedDocId &&
				linkedFileInfo?.filePath &&
				linkedFileInfo.filePath.endsWith(".tex")
			) {
				setAutoMainFile(linkedFileInfo.filePath);
				return;
			}

			if (selectedFileId) {
				const file = await getFile(selectedFileId);
				if (file?.path.endsWith(".tex")) {
					setAutoMainFile(file.path);
					return;
				}
			}

			const texFile = allTexFiles[0];
			setAutoMainFile(texFile);
		};

		findMainFile();
	}, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo]);

	useEffect(() => {
		if (useSharedSettings && projectEngine && projectEngine !== latexEngine) {
			setLatexEngine(projectEngine);
		}
	}, [projectEngine, latexEngine, setLatexEngine, useSharedSettings]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const handleCompileOrStop = async () => {
		if (isCompiling) {
			stopCompilation();
		} else if (effectiveMainFile) {
			if (onExpandLatexOutput) {
				onExpandLatexOutput();
			}

			if (shouldNavigateOnCompile && onNavigateToLinkedFile && effectiveMainFile) {
				if (linkedFileInfo?.filePath === effectiveMainFile) {
					onNavigateToLinkedFile();
				} else {
					document.dispatchEvent(
						new CustomEvent("navigate-to-compiled-file", {
							detail: {
								filePath: effectiveMainFile,
							},
						}),
					);
				}
			}

			await compileDocument(effectiveMainFile);
		}
	};

	const handleClearCache = async () => {
		try {
			await clearCache();
		} catch (error) {
			console.error("Failed to clear cache:", error);
		}
	};

	const handleClearCacheAndCompile = async () => {
		if (!effectiveMainFile) return;

		if (onExpandLatexOutput) {
			onExpandLatexOutput();
		}

		if (shouldNavigateOnCompile && onNavigateToLinkedFile && effectiveMainFile) {
			if (linkedFileInfo?.filePath === effectiveMainFile) {
				onNavigateToLinkedFile();
			} else {
				document.dispatchEvent(
					new CustomEvent("navigate-to-compiled-file", {
						detail: {
							filePath: effectiveMainFile,
						},
					}),
				);
			}
		}

		try {
			await compileWithClearCache(effectiveMainFile);
		} catch (error) {
			console.error("Failed to compile with cache clear:", error);
		}
	};

	useEffect(() => {
		const buttonElement = document.querySelector('.header-compile-button');
		if (buttonElement) {
			(buttonElement as any).clearAndCompile = handleClearCacheAndCompile;
		}
	}, [handleClearCacheAndCompile]);

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	const handleEngineChange = async (engine: string) => {
		setIsChangingEngine(true);
		try {
			if (useSharedSettings && projectEngine) {
				if (changeDoc) {
					changeDoc((d) => {
						if (!d.projectMetadata) {
							d.projectMetadata = { name: "", description: "" };
						}
						d.projectMetadata.latexEngine = engine as "pdftex" | "xetex" | "luatex";
					});
				}
			} else {
				await setLatexEngine(engine as "pdftex" | "xetex" | "luatex");
			}
			setIsDropdownOpen(false);
		} catch (error) {
			console.error("Failed to change engine:", error);
		} finally {
			setIsChangingEngine(false);
		}
	};

	const handleMainFileChange = (filePath: string) => {
		if (useSharedSettings && projectMainFile) {
			if (!changeDoc) return;
			changeDoc((d) => {
				if (!d.projectMetadata) {
					d.projectMetadata = { name: "", description: "" };
				}
				d.projectMetadata.mainFile = filePath === "auto" ? undefined : filePath;
			});
		} else {
			setUserSelectedMainFile(filePath === "auto" ? undefined : filePath);
		}
	};

	const handleShareMainFile = (checked: boolean) => {
		if (!useSharedSettings || !changeDoc) return;

		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = { name: "", description: "" };
			}
			if (checked) {
				d.projectMetadata.mainFile = userSelectedMainFile || autoMainFile;
			} else {
				delete d.projectMetadata.mainFile;
			}
		});
	};

	const handleShareEngine = (checked: boolean) => {
		if (!useSharedSettings || !changeDoc) return;

		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = { name: "", description: "" };
			}
			if (checked) {
				d.projectMetadata.latexEngine = latexEngine;
			} else {
				delete d.projectMetadata.latexEngine;
			}
		});
	};

	const getFileName = (path?: string) => {
		if (!path) return "No .tex file";
		return path.split("/").pop() || path;
	};

	const getDisplayName = (path?: string) => {
		if (!path) return "No .tex file";

		if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
			const doc = documents.find((d) => d.id === selectedDocId);
			if (doc) {
				return `${doc.name} (linked)`;
			}
		}

		return getFileName(path);
	};

	const isDisabled = !isCompiling && (!effectiveMainFile || isChangingEngine);

	return (
		<div className={`latex-compile-buttons ${className}`} ref={dropdownRef}>
			<div className="compile-button-group">
				<button
					className={`latex-button compile-button ${
						isCompiling ? "compiling" : ""
					} ${isChangingEngine ? "loading" : ""}`}
					onClick={handleCompileOrStop}
					disabled={isDisabled}
					title={
						isCompiling
							? "Stop Compilation (F8)"
							: isChangingEngine
								? "Switching Engine..."
								: "Compile LaTeX Document (F9)"
					}
				>
					{isCompiling ? <StopIcon /> : <PlayIcon />}
				</button>

				<PdfWindowToggleButton
					className="pdf-window-button"
					projectId={docUrl?.startsWith("yjs:") ? docUrl.slice(4) : docUrl || 'unknown'}
					title="Open PDF in new window"
				/>

				<button
					className="latex-button dropdown-toggle"
					onClick={toggleDropdown}
					disabled={isChangingEngine}
					title="Compilation Options"
				>
					<ChevronDownIcon />
				</button>
			</div>
			{isDropdownOpen && (
				<div className="latex-dropdown">
					<div className="main-file-display">
						<div className="main-file-label">Main file:</div>
						<div className="main-file-path" title={effectiveMainFile}>
							{getDisplayName(effectiveMainFile)}
							{projectMainFile && <span className="shared-indicator"> (shared)</span>}
						</div>
					</div>

					{useSharedSettings && (
						<>
							<div className="main-file-selector">
								<div className="main-file-selector-label">Select main file:</div>
								<select
									value={projectMainFile || userSelectedMainFile || "auto"}
									onChange={(e) => handleMainFileChange(e.target.value)}
									className="main-file-select"
									disabled={isChangingEngine || isCompiling}
								>
									<option value="auto">Auto-detect</option>
									{availableTexFiles.map((filePath) => (
										<option key={filePath} value={filePath}>
											{getFileName(filePath)}
										</option>
									))}
								</select>
								<label className="share-checkbox">
									<input
										type="checkbox"
										checked={!!projectMainFile}
										onChange={(e) => handleShareMainFile(e.target.checked)}
										disabled={isChangingEngine || isCompiling || !effectiveMainFile}
									/>
									Share with collaborators
								</label>
							</div>
						</>
					)}

					<div className="engine-selector">
						<div className="engine-label">LaTeX Engine:</div>
						<select
							value={effectiveEngine}
							onChange={(e) => handleEngineChange(e.target.value)}
							className="engine-select"
							disabled={isChangingEngine || isCompiling}
						>
							<option value="pdftex">pdfTeX</option>
							<option value="xetex">XeTeX</option>
							{/*<option value="luatex">LuaTeX</option>*/}
						</select>
						{useSharedSettings && (
							<label className="share-checkbox">
								<input
									type="checkbox"
									checked={!!projectEngine}
									onChange={(e) => handleShareEngine(e.target.checked)}
									disabled={isChangingEngine || isCompiling}
								/>
								Share with collaborators
							</label>
						)}
						{isChangingEngine && (
							<div className="engine-status">Switching engine...</div>
						)}
					</div>

					<div className="cache-controls">
						<div
							className="cache-item clear-cache"
							onClick={handleClearCache}
							title="Clear compilation cache and source files"
						>
							<TrashIcon />
							Clear Cache
						</div>
						<div
							className="cache-item clear-and-compile clear-and-compile-button"
							onClick={handleClearCacheAndCompile}
							title="Clear cache and compile (Shift+F9)"
						>
							<ClearCompileIcon/>
							Clear & Compile
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default LaTeXCompileButton;