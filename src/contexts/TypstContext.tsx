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
import { typstService, type TypstCompileResult } from "../services/TypstService";
import { parseUrlFragments } from "../utils/urlUtils";

export interface TypstContextType {
    isCompiling: boolean;
    compileError: string | null;
    compiledPdf: Uint8Array | null;
    compileLog: string;
    compileDocument: (mainFileName: string) => Promise<void>;
    stopCompilation: () => void;
    toggleOutputView: () => void;
    currentView: "log" | "pdf";
    clearCache: () => void;
    triggerAutoCompile: () => void;
}

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
    const [compileLog, setCompileLog] = useState<string>("");
    const [currentView, setCurrentView] = useState<"log" | "pdf">("log");
    const settingsRegistered = useRef(false);

    useEffect(() => {
        if (settingsRegistered.current) return;
        settingsRegistered.current = true;

        const initialAutoCompile = 
            (getSetting("typst-auto-compile-on-open")?.value as boolean) ?? false;

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
            id: "typst-notifications",
            category: "Typst",
            subcategory: "Compilation",
            type: "checkbox",
            label: "Show compilation notifications",
            description: "Display notifications for Typst compilation activities",
            defaultValue: true,
        });
    }, [registerSetting, getSetting]);

    useEffect(() => {
        typstService.initialize().catch(console.error);

        return typstService.addStatusListener(() => {
            setIsCompiling(typstService.getStatus() === "compiling");
        });
    }, []);

    const compileDocument = async (mainFileName: string): Promise<void> => {
        if (!typstService.isReady()) {
            await typstService.initialize();
        }

        setIsCompiling(true);
        setCompileError(null);

        try {
            const result = await typstService.compileTypst(mainFileName, fileTree);

            setCompileLog(result.log);
            if (result.status === 0 && result.pdf) {
                setCompiledPdf(result.pdf);
                setCurrentView("pdf");
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
        setCurrentView(currentView === "log" ? "pdf" : "log");
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
                compileLog,
                compileDocument,
                stopCompilation,
                toggleOutputView,
                currentView,
                clearCache,
                triggerAutoCompile,
            }}
        >
            {children}
        </TypstContext.Provider>
    );
};