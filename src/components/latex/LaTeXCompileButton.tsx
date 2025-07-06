// src/components/latex/LaTeXCompileButton.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";

import { useFileTree } from "../../hooks/useFileTree";
import { useLaTeX } from "../../hooks/useLaTeX";
import type { FileNode } from "../../types/files.ts";
import { ChevronDownIcon, PlayIcon, StopIcon } from "../common/Icons";

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
}

const LaTeXCompileButton: React.FC<LaTeXCompileButtonProps> = ({
	className = "",
	selectedDocId,
	documents,
	onNavigateToLinkedFile,
	onExpandLatexOutput,
	linkedFileInfo,
	shouldNavigateOnCompile = false,
}) => {
	const {
		isCompiling,
		compileDocument,
		stopCompilation,
		latexEngine,
		setLatexEngine,
	} = useLaTeX();
	const { selectedFileId, getFile, fileTree } = useFileTree();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [mainFile, setMainFile] = useState<string | undefined>();
	const [isChangingEngine, setIsChangingEngine] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const findMainFile = async () => {
			// Priority 1: If a document is selected and has a linked .tex file
			if (
				selectedDocId &&
				linkedFileInfo?.filePath &&
				linkedFileInfo.filePath.endsWith(".tex")
			) {
				setMainFile(linkedFileInfo.filePath);
				return;
			}

			// Priority 2: If a .tex file is currently selected
			if (selectedFileId) {
				const file = await getFile(selectedFileId);
				if (file?.path.endsWith(".tex")) {
					setMainFile(file.path);
					return;
				}
			}

			// Priority 3: Find any .tex file in the file tree
			const findTexFile = (nodes: FileNode[]): string | undefined => {
				for (const node of nodes) {
					if (node.type === "file" && node.path.endsWith(".tex")) {
						return node.path;
					}
					if (node.children) {
						const found = findTexFile(node.children);
						if (found) return found;
					}
				}
				return undefined;
			};

			const texFile = findTexFile(fileTree);
			setMainFile(texFile);
		};

		findMainFile();
	}, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo]);

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
		} else if (mainFile) {
			// Expand LaTeX output panel if collapsed
			if (onExpandLatexOutput) {
				onExpandLatexOutput();
			}

			// Navigate to the file being compiled if this is the main compile button
			if (shouldNavigateOnCompile && onNavigateToLinkedFile && mainFile) {
				// If we have a linked file and it's the file being compiled, navigate to it
				if (linkedFileInfo?.filePath === mainFile) {
					onNavigateToLinkedFile();
				} else {
					// For any other file, dispatch navigation event
					document.dispatchEvent(
						new CustomEvent("navigate-to-compiled-file", {
							detail: {
								filePath: mainFile,
							},
						}),
					);
				}
			}

			await compileDocument(mainFile);
		}
	};

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	const handleEngineChange = async (engine: string) => {
		setIsChangingEngine(true);
		try {
			await setLatexEngine(engine as "pdftex" | "xetex" | "luatex");
			setIsDropdownOpen(false);
		} catch (error) {
			console.error("Failed to change engine:", error);
		} finally {
			setIsChangingEngine(false);
		}
	};

	const getFileName = (path?: string) => {
		if (!path) return "No .tex file";
		return path.split("/").pop() || path;
	};

	const getDisplayName = (path?: string) => {
		if (!path) return "No .tex file";

		// If this is a linked file from a document, show the document name
		if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
			const doc = documents.find((d) => d.id === selectedDocId);
			if (doc) {
				return `${doc.name} (linked)`;
			}
		}

		return getFileName(path);
	};

	const isDisabled = !isCompiling && (!mainFile || isChangingEngine);

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
							? "Stop Compilation"
							: isChangingEngine
								? "Switching Engine..."
								: "Compile LaTeX Document"
					}
				>
					{isCompiling ? <StopIcon /> : <PlayIcon />}
				</button>
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
						<div className="main-file-path" title={mainFile}>
							{getDisplayName(mainFile)}
						</div>
					</div>
					<div className="engine-selector">
						<div className="engine-label">LaTeX Engine:</div>
						<select
							value={latexEngine}
							onChange={(e) => handleEngineChange(e.target.value)}
							className="engine-select"
							disabled={isChangingEngine || isCompiling}
						>
							<option value="pdftex">pdfTeX</option>
							<option value="xetex">XeTeX</option>
							<option value="luatex">LuaTeX</option>
						</select>
						{isChangingEngine && (
							<div className="engine-status">Switching engine...</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default LaTeXCompileButton;
