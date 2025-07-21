// src/contexts/LaTeXContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useEffect,
	useRef,
	useState,
} from "react";

import { useFileTree } from "../hooks/useFileTree";
import { useSettings } from "../hooks/useSettings";
import { latexService } from "../services/LaTeXService";
import type { LaTeXContextType } from "../types/latex";

export const LaTeXContext = createContext<LaTeXContextType | null>(null);

interface LaTeXProviderProps {
	children: ReactNode;
}

export const LaTeXProvider: React.FC<LaTeXProviderProps> = ({ children }) => {
	const { fileTree, refreshFileTree } = useFileTree();
	const { registerSetting, getSetting } = useSettings();
	const [isCompiling, setIsCompiling] = useState<boolean>(false);
	const [compileError, setCompileError] = useState<string | null>(null);
	const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
	const [compileLog, setCompileLog] = useState<string>("");
	const [currentView, setCurrentView] = useState<"log" | "pdf">("log");
	const [latexEngine, setLatexEngine] = useState<"pdftex" | "xetex" | "luatex">(
		"pdftex",
	);
	const settingsRegistered = useRef(false);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialEngine =
			(getSetting("latex-engine")?.value as "pdftex" | "xetex" | "luatex") ??
			"pdftex";
		const initialTexliveEndpoint =
			(getSetting("latex-texlive-endpoint")?.value as string) ??
			"http://texlive.localhost:8082";
		const initialStoreCache =
			(getSetting("latex-store-cache")?.value as boolean) ?? true;
		const initialStoreWorkingDirectory =
			(getSetting("latex-store-working-directory")?.value as boolean) ?? false;

		setLatexEngine(initialEngine);

		registerSetting({
			id: "latex-engine",
			category: "LaTeX",
			subcategory: "Compilation",
			type: "select",
			label: "LaTeX Engine",
			description: "Choose the LaTeX engine for compilation",
			defaultValue: initialEngine,
			options: [
				{ label: "pdfTeX", value: "pdftex" },
				{ label: "XeTeX", value: "xetex" },
				{ label: "LuaTeX", value: "luatex" },
			],
			onChange: (value) => {
				handleSetLatexEngine(value as "pdftex" | "xetex" | "luatex");
			},
		});

		registerSetting({
			id: "latex-texlive-endpoint",
			category: "LaTeX",
			subcategory: "Compilation",
			type: "text",
			label: "TexLive server endpoint",
			description: "URL endpoint for TexLive package downloads",
			defaultValue: initialTexliveEndpoint,
			onChange: (value) => {
				latexService.setTexliveEndpoint(value as string);
			},
		});

		registerSetting({
			id: "latex-store-cache",
			category: "LaTeX",
			subcategory: "Compilation",
			type: "checkbox",
			label: "Store compilation cache",
			description: "Save TeX cache files for faster subsequent compilations",
			defaultValue: initialStoreCache,
			onChange: (value) => {
				latexService.setStoreCache(value as boolean);
			},
		});

		registerSetting({
			id: "latex-store-working-directory",
			category: "LaTeX",
			subcategory: "Compilation",
			type: "checkbox",
			label: "Store working directory",
			description: "Save all working directory files after compilation",
			defaultValue: initialStoreWorkingDirectory,
			onChange: (value) => {
				latexService.setStoreWorkingDirectory(value as boolean);
			},
		});

		latexService.setTexliveEndpoint(initialTexliveEndpoint);
		latexService.setStoreCache(initialStoreCache);
		latexService.setStoreWorkingDirectory(initialStoreWorkingDirectory);
	}, [registerSetting, getSetting]);

	useEffect(() => {
		latexService.initialize(latexEngine).catch(console.error);

		return latexService.addStatusListener(() => {
			setIsCompiling(latexService.getStatus() === "compiling");
		});
	}, [latexEngine]);

	const handleSetLatexEngine = async (
		engine: "pdftex" | "xetex" | "luatex",
	) => {
		if (engine === latexEngine) return;

		setLatexEngine(engine);
		try {
			await latexService.setEngine(engine);
		} catch (error) {
			console.error(`Failed to switch to ${engine} engine:`, error);
			setCompileError(`Failed to switch to ${engine} engine`);
		}
	};

	const compileDocument = async (mainFileName: string): Promise<void> => {
		if (!latexService.isReady()) {
			await latexService.initialize(latexEngine);
		}

		setIsCompiling(true);
		setCompileError(null);

		try {
			const result = await latexService.compileLaTeX(mainFileName, fileTree);

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

	const clearCache = async (): Promise<void> => {
		try {
			await latexService.clearCacheDirectories();
			await refreshFileTree();
		} catch (error) {
			console.error("Failed to clear cache:", error);
			setCompileError("Failed to clear cache");
		}
	};

	const compileWithClearCache = async (mainFileName: string): Promise<void> => {
		if (!latexService.isReady()) {
			await latexService.initialize(latexEngine);
		}

		setIsCompiling(true);
		setCompileError(null);

		try {
			const result = await latexService.clearCacheAndCompile(mainFileName, fileTree);

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

	const stopCompilation = () => {
		if (isCompiling && latexService.isCompiling()) {
			latexService.stopCompilation();
			setIsCompiling(false);
			setCompileError("Compilation stopped by user");
		}
	};

	const toggleOutputView = () => {
		setCurrentView(currentView === "log" ? "pdf" : "log");
	};

	return (
		<LaTeXContext.Provider
			value={{
				isCompiling,
				compileError,
				compiledPdf,
				compileLog,
				compileDocument,
				stopCompilation,
				toggleOutputView,
				currentView,
				latexEngine,
				setLatexEngine: handleSetLatexEngine,
				clearCache,
				compileWithClearCache,
			}}
		>
			{children}
		</LaTeXContext.Provider>
	);
};
