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
    const {
        compileLog,
        compiledPdf,
        compiledSvg,
        currentView,
        toggleOutputView,
        currentFormat
    } = useTypst();
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

    const getCurrentOutput = () => {
        switch (currentFormat) {
            case "pdf":
                return compiledPdf;
            case "svg":
                return compiledSvg;
            default:
                return null;
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

    const handleSaveOutput = useCallback((format: string, defaultName: string) => {
        const currentOutput = getCurrentOutput();
        if (!currentOutput) return;

        let blob: Blob;
        switch (format) {
            case "svg":
                if (!compiledSvg) return;
                blob = new Blob([compiledSvg], { type: "image/svg+xml" });
                break;
            case "pdf":
                if (!compiledPdf) return;
                blob = new Blob([compiledPdf], { type: "application/pdf" });
                break;
            default:
                return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [compiledPdf, compiledSvg]);

    const outputViewerContent = useMemo(() => {
        if (currentView !== "output") return null;

        if (currentFormat === "pdf" && compiledPdf) {
            return (
                <div className="pdf-viewer">
                    {pdfRendererPlugin && useEnhancedRenderer ? (
                        React.createElement(pdfRendererPlugin.renderOutput, {
                            content: compiledPdf.buffer,
                            mimeType: "application/pdf",
                            fileName: "output.pdf",
                            onSave: handleSavePdf,  // Changed from onDownload to onSave
                        })
                    ) : (
                        <embed
                            src={URL.createObjectURL(new Blob([compiledPdf], { type: "application/pdf" }))}
                            type="application/pdf"
                            style={{ width: "100%", height: "100%" }}
                        />
                    )}
                </div>
            );
        }

        if (currentFormat === "svg" && compiledSvg) {
            return (
                <div className="svg-viewer">
                    <div className="svg-canvas-container" style={{
                        width: "100%",
                        height: "calc(100% - 60px)",
                        overflow: "auto",
                        padding: "1rem",
                        backgroundColor: "white",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center"
                    }}>
                        <canvas
                            ref={(canvas) => {
                                if (canvas && compiledSvg) {
                                    const ctx = canvas.getContext('2d');
                                    const img = new Image();
                                    const svgBlob = new Blob([compiledSvg], { type: 'image/svg+xml' });
                                    const url = URL.createObjectURL(svgBlob);

                                    img.onload = () => {
                                        canvas.width = img.width || 800;
                                        canvas.height = img.height || 600;
                                        ctx?.drawImage(img, 0, 0);
                                        URL.revokeObjectURL(url);
                                    };
                                    img.src = url;
                                }
                            }}
                            style={{
                                maxWidth: "100%",
                                maxHeight: "100%",
                                border: "1px solid #ddd"
                            }}
                        />
                    </div>
                    <div className="svg-controls">
                        <button
                            onClick={() => handleSaveOutput("svg", "output.svg")}
                            className="save-button"
                            style={{
                                padding: "0.5rem 1rem",
                                backgroundColor: "var(--primary-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                margin: "1rem"
                            }}
                        >
                            Save SVG
                        </button>
                    </div>
                </div>
            );
        }

        return null;
    }, [currentView, currentFormat, compiledPdf, compiledSvg, pdfRendererPlugin, useEnhancedRenderer, handleSavePdf, handleSaveOutput]);

    const hasAnyOutput = compiledPdf || compiledSvg;

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
                        className={`tab-button ${currentView === "output" ? "active" : ""}`}
                        onClick={() => currentView !== "output" && toggleOutputView()}
                        disabled={!hasAnyOutput}
                    >
                        {currentFormat ? currentFormat.toUpperCase() : "Output"}
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

            {!compileLog && !hasAnyOutput ? (
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

                    {outputViewerContent}
                </>
            )}
        </div>
    );
};

export default TypstOutput;