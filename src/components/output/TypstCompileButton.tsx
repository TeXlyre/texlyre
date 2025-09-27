// src/components/output/TypstCompileButton.tsx
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useFileTree } from "../../hooks/useFileTree";
import { useTypst } from "../../hooks/useTypst";
import { useSettings } from "../../hooks/useSettings";
import type { FileNode } from "../../types/files";
import { isTemporaryFile } from "../../utils/fileUtils";
import { ChevronDownIcon, ClearCompileIcon, PlayIcon, StopIcon, TrashIcon } from "../common/Icons";

interface TypstCompileButtonProps {
    className?: string;
    selectedDocId?: string | null;
    documents?: Array<{ id: string; name: string }>;
    onNavigateToLinkedFile?: () => void;
    onExpandTypstOutput?: () => void;
    linkedFileInfo?: {
        fileName?: string;
        filePath?: string;
        fileId?: string;
    } | null;
    shouldNavigateOnCompile?: boolean;
}

const TypstCompileButton: React.FC<TypstCompileButtonProps> = ({
    className = "",
    selectedDocId,
    documents,
    onNavigateToLinkedFile,
    onExpandTypstOutput,
    linkedFileInfo,
    shouldNavigateOnCompile = false,
}) => {
    const { isCompiling, compileDocument, stopCompilation, clearCache } = useTypst();
    const { selectedFileId, getFile, fileTree } = useFileTree();
    const { getSetting } = useSettings();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
    const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
    const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const effectiveMainFile = userSelectedMainFile || autoMainFile;

    useEffect(() => {
        const findTypstFiles = (nodes: FileNode[]): string[] => {
            const typstFiles: string[] = [];
            for (const node of nodes) {
                if (node.type === "file" && node.path.endsWith(".typ") && !isTemporaryFile(node.path)) {
                    typstFiles.push(node.path);
                }
                if (node.children) {
                    typstFiles.push(...findTypstFiles(node.children));
                }
            }
            return typstFiles;
        };

        const allTypstFiles = findTypstFiles(fileTree);
        setAvailableTypstFiles(allTypstFiles);

        const findMainFile = async () => {
            if (
                selectedDocId &&
                linkedFileInfo?.filePath &&
                linkedFileInfo.filePath.endsWith(".typ")
            ) {
                setAutoMainFile(linkedFileInfo.filePath);
                return;
            }

            if (selectedFileId) {
                const file = await getFile(selectedFileId);
                if (file?.path.endsWith(".typ")) {
                    setAutoMainFile(file.path);
                    return;
                }
            }

            const typstFile = allTypstFiles[0];
            setAutoMainFile(typstFile);
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

    const shouldNavigateToMain = async (mainFilePath: string): Promise<boolean> => {
        const navigationSetting = getSetting("typst-auto-navigate-to-main")?.value as string ?? "conditional";
        
        if (navigationSetting === "never") {
            return false;
        }
        
        if (navigationSetting === "always") {
            return true;
        }
        
        // Conditional navigation logic
        if (navigationSetting === "conditional") {
            if (selectedFileId) {
                try {
                    const currentFile = await getFile(selectedFileId);
                    if (currentFile?.path.endsWith(".typ")) {
                        return false; // Don't navigate if already editing a .typ file
                    }
                } catch (error) {
                    console.warn("Error getting current file:", error);
                }
            }
            
            if (selectedDocId && linkedFileInfo?.fileName?.endsWith(".typ")) {
                return false; // Don't navigate if already editing a Typst-linked document
            }
            
            return true; // Navigate if no Typst file is currently open
        }
        
        return false;
    };

    const handleCompileOrStop = async () => {
        if (isCompiling) {
            stopCompilation();
        } else if (effectiveMainFile) {
            if (onExpandTypstOutput) {
                onExpandTypstOutput();
            }

            const shouldNavigate = await shouldNavigateToMain(effectiveMainFile);

            if (shouldNavigateOnCompile && shouldNavigate) {
                if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
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
            clearCache();
        } catch (error) {
            console.error("Failed to clear cache:", error);
        }
    };

    const handleClearCacheAndCompile = async () => {
        if (!effectiveMainFile) return;

        if (onExpandTypstOutput) {
            onExpandTypstOutput();
        }

        const shouldNavigate = await shouldNavigateToMain(effectiveMainFile);

        if (shouldNavigateOnCompile && shouldNavigate) {
            if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
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
            clearCache();
            await compileDocument(effectiveMainFile);
        } catch (error) {
            console.error("Failed to compile with cache clear:", error);
        }
    };

    const toggleDropdown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDropdownOpen(!isDropdownOpen);
    };

    const handleMainFileChange = (filePath: string) => {
        setUserSelectedMainFile(filePath === "auto" ? undefined : filePath);
    };

    const getFileName = (path?: string) => {
        if (!path) return "No .typ file";
        return path.split("/").pop() || path;
    };

    const getDisplayName = (path?: string) => {
        if (!path) return "No .typ file";

        if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
            const doc = documents.find((d) => d.id === selectedDocId);
            if (doc) {
                return `${doc.name} (linked)`;
            }
        }

        return getFileName(path);
    };

    const isDisabled = !isCompiling && !effectiveMainFile;

    return (
        <div className={`typst-compile-buttons ${className}`} ref={dropdownRef}>
            <div className="compile-button-group">
                <button
                    className={`typst-button compile-button ${isCompiling ? "compiling" : ""}`}
                    onClick={handleCompileOrStop}
                    disabled={isDisabled}
                    title={
                        isCompiling
                            ? "Stop Compilation"
                            : "Compile Typst Document"
                    }
                >
                    {isCompiling ? <StopIcon /> : <PlayIcon />}
                </button>

                <button
                    className="typst-button dropdown-toggle"
                    onClick={toggleDropdown}
                    title="Compilation Options"
                >
                    <ChevronDownIcon />
                </button>
            </div>
            
            {isDropdownOpen && (
                <div className="typst-dropdown">
                    <div className="main-file-display">
                        <div className="main-file-label">Main file:</div>
                        <div className="main-file-path" title={effectiveMainFile}>
                            {getDisplayName(effectiveMainFile)}
                        </div>
                    </div>

                    <div className="main-file-selector">
                        <div className="main-file-selector-label">Select main file:</div>
                        <select
                            value={userSelectedMainFile || "auto"}
                            onChange={(e) => handleMainFileChange(e.target.value)}
                            className="main-file-select"
                            disabled={isCompiling}
                        >
                            <option value="auto">Auto-detect</option>
                            {availableTypstFiles.map((filePath) => (
                                <option key={filePath} value={filePath}>
                                    {getFileName(filePath)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="cache-controls">
                        <div
                            className="cache-item clear-cache"
                            onClick={handleClearCache}
                            title="Clear compilation cache"
                        >
                            <TrashIcon />
                            Clear Cache
                        </div>
                        <div
                            className="cache-item clear-and-compile"
                            onClick={handleClearCacheAndCompile}
                            title="Clear cache and compile"
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

export default TypstCompileButton;