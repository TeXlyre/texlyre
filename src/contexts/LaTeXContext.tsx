// src/contexts/LaTeXContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useEffect,
	useCallback,
	useRef,
	useState,
} from 'react';

import { useFileTree } from '../hooks/useFileTree';
import { useSettings } from '../hooks/useSettings';
import { latexService } from '../services/LaTeXService';
import type { LaTeXContextType } from '../types/latex';
import { parseUrlFragments } from '../utils/urlUtils';
import { pdfWindowService } from '../services/PdfWindowService';

export const LaTeXContext = createContext<LaTeXContextType | null>(null);

interface LaTeXProviderProps {
	children: ReactNode;
}

export const LaTeXProvider: React.FC<LaTeXProviderProps> = ({ children }) => {
	const { fileTree, refreshFileTree } = useFileTree();
	const { registerSetting, getSetting } = useSettings();
	const [isCompiling, setIsCompiling] = useState<boolean>(false);
	const [hasAutoCompiled, setHasAutoCompiled] = useState(false);
	const [compileError, setCompileError] = useState<string | null>(null);
	const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
	const [compileLog, setCompileLog] = useState<string>('');
	const [currentView, setCurrentView] = useState<'log' | 'pdf'>('log');
	const [latexEngine, setLatexEngine] = useState<'pdftex' | 'xetex' | 'luatex'>(
		'pdftex',
	);
	const [activeCompiler, setActiveCompiler] = useState<string | null>(null);
	const settingsRegistered = useRef(false);

	useEffect(() => {
		const handleCompilerActive = (event: CustomEvent) => {
			setActiveCompiler(event.detail.type);
		};

		document.addEventListener('compiler-active', handleCompilerActive as EventListener);
		return () => {
			document.removeEventListener('compiler-active', handleCompilerActive as EventListener);
		};
	}, []);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialEngine =
			(getSetting('latex-engine')?.value as 'pdftex' | 'xetex' | 'luatex') ??
			'pdftex';
		const initialTexliveEndpoint =
			(getSetting('latex-texlive-endpoint')?.value as string) ??
			'http://texlive.localhost:8082';
		const initialStoreCache =
			(getSetting('latex-store-cache')?.value as boolean) ?? true;
		const initialStoreWorkingDirectory =
			(getSetting('latex-store-working-directory')?.value as boolean) ?? false;
		const initialAutoCompile =
			(getSetting('latex-auto-compile-on-open')?.value as boolean) ?? false;
		const initialAutoNavigate =
			(getSetting('latex-auto-navigate-to-main')?.value as string) ?? 'conditional';

		setLatexEngine(initialEngine);

		registerSetting({
			id: 'latex-engine',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'select',
			label: 'LaTeX Engine',
			description: 'Choose the LaTeX engine for compilation',
			defaultValue: initialEngine,
			options: [
				{ label: 'pdfTeX', value: 'pdftex' },
				{ label: 'XeTeX', value: 'xetex' },
				// { label: "LuaTeX", value: "luatex" },
			],
			onChange: (value) => {
				handleSetLatexEngine(value as 'pdftex' | 'xetex' | 'luatex');
			},
		});

		registerSetting({
			id: 'latex-texlive-endpoint',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'text',
			label: 'TexLive server endpoint',
			description: 'URL endpoint for TexLive package downloads',
			defaultValue: initialTexliveEndpoint,
			onChange: (value) => {
				latexService.setTexliveEndpoint(value as string);
			},
		});

		registerSetting({
			id: 'latex-auto-compile-on-open',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'checkbox',
			label: 'Auto-compile on project open',
			description: 'Automatically compile LaTeX when opening a project',
			defaultValue: initialAutoCompile,
		});

		registerSetting({
			id: 'latex-auto-navigate-to-main',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'select',
			label: 'Auto-navigate to main file on compile',
			description: 'Control when to automatically navigate to the main LaTeX file during compilation',
			defaultValue: initialAutoNavigate,
			options: [
				{ label: 'Only when no LaTeX file is open', value: 'conditional' },
				{ label: 'Always navigate to main file', value: 'always' },
				{ label: 'Never navigate to main file', value: 'never' },
			],
		});

		registerSetting({
			id: 'latex-store-cache',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'checkbox',
			label: 'Store compilation cache',
			description: 'Save TeX cache files for faster subsequent compilations',
			defaultValue: initialStoreCache,
			onChange: (value) => {
				latexService.setStoreCache(value as boolean);
			},
		});

		registerSetting({
			id: 'latex-store-working-directory',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'checkbox',
			label: 'Store working directory',
			description: 'Save all working directory files after compilation',
			defaultValue: initialStoreWorkingDirectory,
			onChange: (value) => {
				latexService.setStoreWorkingDirectory(value as boolean);
			},
		});

		registerSetting({
			id: 'latex-notifications',
			category: 'LaTeX',
			subcategory: 'Compilation',
			type: 'checkbox',
			label: 'Show compilation notifications',
			description: 'Display notifications for LaTeX compilation activities',
			defaultValue: true,
			onChange: () => {
				// Notification setting changes are handled by the service
			},
		});

		latexService.setTexliveEndpoint(initialTexliveEndpoint);
		latexService.setStoreCache(initialStoreCache);
		latexService.setStoreWorkingDirectory(initialStoreWorkingDirectory);
	}, [registerSetting, getSetting]);

	useEffect(() => {
		latexService.initialize(latexEngine).catch(console.error);

		return latexService.addStatusListener(() => {
			setIsCompiling(latexService.getStatus() === 'compiling');
		});
	}, [latexEngine]);

	const handleSetLatexEngine = async (
		engine: 'pdftex' | 'xetex' | 'luatex',
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

	const getProjectName = (): string => {
		// Try to get project name from document title or URL
		if (document.title && document.title !== 'TeXlyre') {
			return document.title;
		}

		// Fallback to extracting from URL hash
		const hash = window.location.hash;
		if (hash.includes('yjs:')) {
			const projectId = hash.split('yjs:')[1].split('&')[0];
			return `Project ${projectId.substring(0, 8)}`;
		}

		return 'LaTeX Project';
	};

	const compileDocument = async (mainFileName: string): Promise<void> => {
		if (!latexService.isReady()) {
			await latexService.initialize(latexEngine);
		}

		setIsCompiling(true);
		setCompileError(null);
		setActiveCompiler('latex');

		try {
			const result = await latexService.compileLaTeX(mainFileName, fileTree);

			setCompileLog(result.log);
			if (result.status === 0 && result.pdf) {
				setCompiledPdf(result.pdf);
				setCurrentView('pdf');

				// Send PDF to window if open
				const fileName = mainFileName.split('/').pop()?.replace(/\.(tex|ltx)$/i, '.pdf') || 'output.pdf';
				const projectName = getProjectName();

				pdfWindowService.sendPdfUpdate(
					result.pdf,
					fileName,
					projectName
				);
			} else {
				setCompileError('Compilation failed');
				setCurrentView('log');

				// Send compile status to window
				pdfWindowService.sendCompileResult(result.status, result.log);
			}

			await refreshFileTree();
		} catch (error) {
			setCompileError(error instanceof Error ? error.message : 'Unknown error');
			setCurrentView('log');

			// Send error to window
			pdfWindowService.sendCompileResult(-1, error instanceof Error ? error.message : 'Unknown error');
		} finally {
			setIsCompiling(false);
		}
	};

	const triggerAutoCompile = useCallback(() => {
		const hashUrl = window.location.hash.substring(1);
		const fragments = parseUrlFragments(hashUrl);

		if (fragments.compile) {
			const cleanUrl = hashUrl.replace(/&compile:[^&]*/, '');
			window.location.hash = cleanUrl;

			const engine = fragments.compile as 'pdftex' | 'xetex' | 'luatex';
			if (['pdftex', 'xetex', 'luatex'].includes(engine)) {
				handleSetLatexEngine(engine).then(() => {
					document.dispatchEvent(new CustomEvent('trigger-compile'));
				});
				setHasAutoCompiled(true);
				return;
			}
		}

		const autoCompileEnabled = getSetting('latex-auto-compile-on-open')?.value as boolean ?? false;
		if (autoCompileEnabled && !hasAutoCompiled) {
			document.dispatchEvent(new CustomEvent('trigger-compile'));
			setHasAutoCompiled(true);
		}
	}, [getSetting, handleSetLatexEngine, hasAutoCompiled]);

	const clearCache = async (): Promise<void> => {
		try {
			await latexService.clearCacheDirectories();
			await refreshFileTree();
		} catch (error) {
			console.error('Failed to clear cache:', error);
			setCompileError('Failed to clear cache');
		}
	};

	const compileWithClearCache = async (mainFileName: string): Promise<void> => {
		if (!latexService.isReady()) {
			await latexService.initialize(latexEngine);
		}

		setIsCompiling(true);
		setCompileError(null);
		setActiveCompiler('latex');

		try {
			const result = await latexService.clearCacheAndCompile(mainFileName, fileTree);

			setCompileLog(result.log);
			if (result.status === 0 && result.pdf) {
				setCompiledPdf(result.pdf);
				setCurrentView('pdf');

				// Send PDF to window if open
				const fileName = mainFileName.split('/').pop()?.replace(/\.(tex|ltx)$/i, '.pdf') || 'output.pdf';
				const projectName = getProjectName();

				pdfWindowService.sendPdfUpdate(
					result.pdf,
					fileName,
					projectName
				);
			} else {
				setCompileError('Compilation failed');
				setCurrentView('log');

				// Send compile status to window
				pdfWindowService.sendCompileResult(result.status, result.log);
			}

			await refreshFileTree();
		} catch (error) {
			setCompileError(error instanceof Error ? error.message : 'Unknown error');
			setCurrentView('log');

			// Send error to window
			pdfWindowService.sendCompileResult(-1, error instanceof Error ? error.message : 'Unknown error');
		} finally {
			setIsCompiling(false);
		}
	};

	const stopCompilation = () => {
		if (isCompiling && latexService.isCompiling()) {
			latexService.stopCompilation();
			setIsCompiling(false);
			setCompileError('Compilation stopped by user');
		}
	};

	const toggleOutputView = () => {
		setCurrentView(currentView === 'log' ? 'pdf' : 'log');
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
				triggerAutoCompile,
				activeCompiler,
			}}
		>
			{children}
		</LaTeXContext.Provider>
	);
};