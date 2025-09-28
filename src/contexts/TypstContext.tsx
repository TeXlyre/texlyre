// src/contexts/TypstContext.tsx
import type React from "react";
import {
    type ReactNode,
    createContext,
    useEffect,
    useCallback,
    useRef,
    useState,
} from "react";

import { useFileTree } from "../hooks/useFileTree";
import { useSettings } from "../hooks/useSettings";
import type { TypstContextType, TypstOutputFormat } from "../types/typst";
import { typstService } from "../services/TypstService";
import { parseUrlFragments } from "../utils/urlUtils";

export const TypstContext = createContext<TypstContextType | null>(null);

interface TypstProviderProps {
    children: ReactNode;
}

export const TypstProvider: React.FC<TypstProviderProps> = ({ children }) => {
    const { fileTree, refreshFileTree } = useFileTree();
    const { registerSetting, getSetting } = useSettings();
    const [isCompiling, setIsCompiling] = useState<boolean>(false);
    const [hasAutoCompiled, setHasAutoCompiled] = useState(false);
    const [compileError, setCompileError] = useState<string | null>(null);
    const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
    const [compiledSvg, setCompiledSvg] = useState<string | null>(null);
    const [compiledCanvas, setCompiledCanvas] = useState<Uint8Array | null>(null);
    const [compileLog, setCompileLog] = useState<string>("");
    const [currentView, setCurrentView] = useState<"log" | "output">("log");
    const [currentFormat, setCurrentFormat] = useState<TypstOutputFormat>("pdf");
    const [activeCompiler, setActiveCompiler] = useState<string | null>(null);
    const settingsRegistered = useRef(false);

    useEffect(() => {
        if (settingsRegistered.current) return;
        settingsRegistered.current = true;

        const initialAutoCompile =
            (getSetting("typst-auto-compile-on-open")?.value as boolean) ?? false;
        const initialDefaultFormat =
            (getSetting("typst-default-format")?.value as TypstOutputFormat) ?? "pdf";
        const initialAutoNavigate =
            (getSetting("typst-auto-navigate-to-main")?.value as string) ?? "conditional";

        setCurrentFormat(initialDefaultFormat);

        registerSetting({
            id: "typst-auto-compile-on-open",
            category: "Typst",
            subcategory: "Compilation",
            type: "checkbox",
            label: "Auto-compile on project open",
            description: "Automatically compile Typst when opening a project",
            defaultValue: initialAutoCompile,
        });

        registerSetting({
            id: "typst-auto-navigate-to-main",
            category: "Typst",
            subcategory: "Compilation",
            type: "select",
            label: "Auto-navigate to main file on compile",
            description: "Control when to automatically navigate to the main Typst file during compilation",
            defaultValue: initialAutoNavigate,
            options: [
                { label: "Only when no Typst file is open", value: "conditional" },
                { label: "Always navigate to main file", value: "always" },
                { label: "Never navigate to main file", value: "never" },
            ],
        });

        registerSetting({
            id: "typst-default-format",
            category: "Typst",
            subcategory: "Compilation",
            type: "select",
            label: "Default output format",
            description: "Default format for Typst compilation",
            defaultValue: initialDefaultFormat,
            options: [
                { label: "PDF", value: "pdf" },
                { label: "SVG", value: "svg" },
                { label: "Canvas", value: "canvas" },
            ],
            onChange: (value) => {
                setCurrentFormat(value as TypstOutputFormat);
                typstService.setDefaultFormat(value as TypstOutputFormat);
            },
        });

        registerSetting({
            id: "typst-notifications",
            category: "Typst",
            subcategory: "Compilation",
            type: "checkbox",
            label: "Show compilation notifications",
            description: "Display notifications for Typst compilation activities",
            defaultValue: true,
        });

        typstService.setDefaultFormat(initialDefaultFormat);
    }, [registerSetting, getSetting]);

    useEffect(() => {
        typstService.initialize().catch(console.error);

        return typstService.addStatusListener(() => {
            setIsCompiling(typstService.getStatus() === "compiling");
        });
    }, []);

    const compileDocument = async (mainFileName: string, format: TypstOutputFormat = currentFormat): Promise<void> => {
        if (!typstService.isReady()) {
            await typstService.initialize();
        }

        setIsCompiling(true);
        setCompileError(null);
        setActiveCompiler('typst');

        setCompiledPdf(null);
        setCompiledSvg(null);
        setCompiledCanvas(null);

        try {
            const result = await typstService.compileTypst(mainFileName, fileTree, format);

            setCompileLog(result.log);
            if (result.status === 0) {
                switch (result.format) {
                    case "pdf":
                        if (result.pdf) {
                            setCompiledPdf(result.pdf);
                            setCurrentView("output");
                        }
                        break;
                    case "svg":
                        if (result.svg) {
                            setCompiledSvg(result.svg);
                            setCurrentView("output");
                        }
                        break;
                    case "canvas":
                        if (result.canvas) {
                            setCompiledCanvas(result.canvas);
                            setCurrentView("output");
                        }
                        break;
                }
            } else {
                setCompileError("Compilation failed");
                setCurrentView("log");
            }

            await refreshFileTree();
        } catch (error) {
            setCompileError(error instanceof Error ? error.message : "Unknown error");
            setCurrentView("log");
        } finally {
            setIsCompiling(false);
        }
    };

    const triggerAutoCompile = useCallback(() => {
        const hashUrl = window.location.hash.substring(1);
        const fragments = parseUrlFragments(hashUrl);

        if (fragments.compile === "typst") {
            const cleanUrl = hashUrl.replace(/&compile:[^&]*/, '');
            window.location.hash = cleanUrl;
            document.dispatchEvent(new CustomEvent('trigger-typst-compile'));
            setHasAutoCompiled(true);
            return;
        }

        const autoCompileEnabled = getSetting("typst-auto-compile-on-open")?.value as boolean ?? false;
        if (autoCompileEnabled && !hasAutoCompiled) {
            document.dispatchEvent(new CustomEvent('trigger-typst-compile'));
            setHasAutoCompiled(true);
        }
    }, [getSetting, hasAutoCompiled]);

    const stopCompilation = () => {
        if (isCompiling) {
            typstService.stopCompilation();
            setIsCompiling(false);
            setCompileError("Compilation stopped by user");
        }
    };

    const toggleOutputView = () => {
        setCurrentView(currentView === "log" ? "output" : "log");
    };

    const clearCache = () => {
        typstService.clearCache();
    };

    return (
        <TypstContext.Provider
            value={{
                isCompiling,
                compileError,
                compiledPdf,
                compiledSvg,
                compiledCanvas,
                compileLog,
                currentFormat,
                setCurrentFormat,
                compileDocument,
                stopCompilation,
                toggleOutputView,
                currentView,
                clearCache,
                triggerAutoCompile,
                activeCompiler,
            }}
        >
            {children}
        </TypstContext.Provider>
    );
};