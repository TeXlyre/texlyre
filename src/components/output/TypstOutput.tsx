// src/components/output/TypstOutput.tsx
import React from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";

import { useFileTree } from "../../hooks/useFileTree";
import { useTypst } from "../../hooks/useTypst";
import { useProperties } from "../../hooks/useProperties";
import { useSettings } from "../../hooks/useSettings";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import ResizablePanel from "../common/ResizablePanel";
import TypstCompileButton from "./TypstCompileButton";

interface TypstOutputProps {
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
}

const TypstOutput: React.FC<TypstOutputProps> = ({
    className = "",
    selectedDocId,
    documents,
    onNavigateToLinkedFile,
    onExpandTypstOutput,
    linkedFileInfo,
}) => {
    const { compileLog, compiledPdf, currentView, toggleOutputView } = useTypst();
    const { selectedFileId, getFile } = useFileTree();
    const { getSetting } = useSettings();
    const { getProperty, setProperty, registerProperty } = useProperties();
    const propertiesRegistered = useRef(false);

    const [visualizerHeight, setVisualizerHeight] = useState(300);
    const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);

    const useEnhancedRenderer = getSetting("pdf-renderer-enable")?.value ?? true;
    const loggerPlugin = pluginRegistry.getLoggerForType("typst");
    const pdfRendererPlugin = pluginRegistry.getRendererForOutput("pdf");

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: "typst-log-visualizer-height",
            category: "UI",
            subcategory: "Layout",
            defaultValue: 300,
        });

        registerProperty({
            id: "typst-log-visualizer-collapsed",
            category: "UI",
            subcategory: "Layout",
            defaultValue: false,
        });
    }, [registerProperty]);

    useEffect(() => {
        const storedHeight = getProperty("typst-log-visualizer-height");
        const storedCollapsed = getProperty("typst-log-visualizer-collapsed");

        if (storedHeight !== undefined) {
            setVisualizerHeight(Number(storedHeight));
        }

        if (storedCollapsed !== undefined) {
            setVisualizerCollapsed(Boolean(storedCollapsed));
        }
    }, [getProperty]);

    const handleVisualizerResize = (height: number) => {
        setVisualizerHeight(height);
        setProperty("typst-log-visualizer-height", height);
    };

    const handleVisualizerCollapse = (collapsed: boolean) => {
        setVisualizerCollapsed(collapsed);
        setProperty("typst-log-visualizer-collapsed", collapsed);
    };

    const handleLineClick = async (line: number) => {
        if (!selectedFileId) return;

        try {
            const file = await getFile(selectedFileId);
            if (!file || !file.path.endsWith(".typ")) {
                console.log("[TypstOutput] Selected file is not a .typ file");
                return;
            }

            const event = new CustomEvent("codemirror-goto-line", {
                detail: {
                    line: line,
                    fileId: selectedFileId,
                    filePath: file.path,
                },
            });
            document.dispatchEvent(event);
        } catch (error) {
            console.error("Error handling line click:", error);
        }
    };

    const handleSavePdf = useCallback((fileName: string) => {
        if (!compiledPdf) return;

        const blob = new Blob([compiledPdf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [compiledPdf]);

    const pdfViewerContent = useMemo(() => {
        if (currentView !== "pdf" || !compiledPdf) return null;
        
        return (
            <div className="pdf-viewer">
                {pdfRendererPlugin && useEnhancedRenderer ? (
                    React.createElement(pdfRendererPlugin.renderOutput, {
                        content: compiledPdf.buffer,
                        mimeType: "application/pdf",
                        fileName: "output.pdf",
                        onSave: handleSavePdf,
                    })
                ) : (
                    <embed
                        src={URL.createObjectURL(
                            new Blob([compiledPdf], { type: "application/pdf" }),
                        )}
                        type="application/pdf"
                        style={{ width: "100%", height: "100%" }}
                    />
                )}
            </div>
        );
    }, [currentView, compiledPdf, pdfRendererPlugin, useEnhancedRenderer, handleSavePdf]);

    return (
        <div className={`typst-output ${className}`}>
            <div className="output-header">
                <div className="view-tabs">
                    <button
                        className={`tab-button ${currentView === "log" ? "active" : ""}`}
                        onClick={() => currentView !== "log" && toggleOutputView()}
                    >
                        Log
                    </button>
                    <button
                        className={`tab-button ${currentView === "pdf" ? "active" : ""}`}
                        onClick={() => currentView !== "pdf" && toggleOutputView()}
                        disabled={!compiledPdf}
                    >
                        PDF
                    </button>
                </div>
                <TypstCompileButton
                    className="output-compile-button"
                    selectedDocId={selectedDocId}
                    documents={documents}
                    onNavigateToLinkedFile={onNavigateToLinkedFile}
                    onExpandTypstOutput={onExpandTypstOutput}
                    linkedFileInfo={linkedFileInfo}
                    shouldNavigateOnCompile={false}
                />
            </div>

            {!compileLog && !compiledPdf ? (
                <div className="empty-state">
                    <p>No output available. Compile a Typst document to see results.</p>
                </div>
            ) : (
                <>
                    {currentView === "log" && (
                        <div className="log-view-container">
                            {loggerPlugin ? (
                                <div className="split-log-view">
                                    <ResizablePanel
                                        direction="vertical"
                                        alignment="end"
                                        height={visualizerHeight}
                                        minHeight={150}
                                        maxHeight={600}
                                        className="visualizer-panel-wrapper"
                                        onResize={handleVisualizerResize}
                                        collapsed={visualizerCollapsed}
                                        onCollapse={handleVisualizerCollapse}
                                    >
                                        <div className="visualizer-panel">
                                            {React.createElement(loggerPlugin.renderVisualizer, {
                                                log: compileLog,
                                                onLineClick: handleLineClick,
                                            })}
                                        </div>
                                    </ResizablePanel>
                                    <div className="raw-log-panel">
                                        <pre className="log-viewer">{compileLog}</pre>
                                    </div>
                                </div>
                            ) : (
                                <div className="log-viewer">
                                    <pre>{compileLog}</pre>
                                </div>
                            )}
                        </div>
                    )}

                    {pdfViewerContent}
                </>
            )}
        </div>
    );
};

export default TypstOutput;