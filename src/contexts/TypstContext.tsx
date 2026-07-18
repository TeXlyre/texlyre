// src/contexts/TypstContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useEffect,
	useCallback,
	useState,
} from 'react';

import { t } from '@/i18n';
import { useFileTree } from '../hooks/useFileTree';
import { useSettings } from '../hooks/useSettings';
import type {
	TypstContextType,
	TypstOutputFormat,
	TypstPdfOptions,
} from '../types/typst';
import { typstService } from '../services/TypstService';
import { popoutViewerService } from '../services/PopoutViewerService';
import {
	parseUrlFragments,
	replaceHash,
	getProjectName,
} from '../utils/urlUtils';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('TypstContext');

export const TypstContext = createContext<TypstContextType | null>(null);

interface TypstProviderProps {
	children: ReactNode;
}

export const TypstProvider: React.FC<TypstProviderProps> = ({ children }) => {
	const { fileTree, refreshFileTree } = useFileTree();
	const { getSetting } = useSettings();

	const [isCompiling, setIsCompiling] = useState<boolean>(false);
	const [isInitializing, setIsInitializing] = useState(false);
	const [hasAutoCompiled, setHasAutoCompiled] = useState(false);
	const [compileError, setCompileError] = useState<string | null>(null);
	const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
	const [compiledSvg] = useState<string | null>(null);
	const [compiledCanvas, setCompiledCanvas] = useState<Uint8Array | null>(null);
	const [compileLog, setCompileLog] = useState<string>('');
	const [currentView, setCurrentView] = useState<'log' | 'output'>('log');
	const [logIndicator, setLogIndicator] = useState<
		'idle' | 'success' | 'error'
	>('idle');
	const [activeCompiler, setActiveCompiler] = useState<string | null>(null);

	const currentFormat =
		(getSetting('typst-default-format')?.value as TypstOutputFormat) ?? 'pdf';

	const typstAllowRemoteContent =
		(getSetting('typst-allow-remote-content')?.value as boolean) ?? true;

	const airgapExternalRequests =
		(getSetting('offline-airgap-external-requests')?.value as boolean) ?? false;

	const previewAllowRemoteUrls =
		typstAllowRemoteContent && !airgapExternalRequests;

	useEffect(() => {
		typstService.setDefaultFormat(currentFormat);
	}, [currentFormat]);

	useEffect(() => {
		typstService.initialize().catch(console.error);

		return typstService.addStatusListener(() => {
			setIsCompiling(typstService.getStatus() === 'compiling');
		});
	}, []);

	const compileDocument = async (
		mainFileName: string,
		format: TypstOutputFormat = currentFormat,
		pdfOptions?: TypstPdfOptions,
	): Promise<void> => {
		moduleLog.info('compileDocument called', {
			mainFileName,
			format,
			pdfOptions,
			allowRemoteUrls: previewAllowRemoteUrls,
		});

		setCompileError(null);

		if (!typstService.isReady()) {
			setIsInitializing(true);

			try {
				await typstService.initialize();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : t('Unknown error');

				setCompileError(message);
				setCurrentView('log');
				setLogIndicator('error');
				popoutViewerService.sendCompileResult(-1, message);
				return;
			} finally {
				setIsInitializing(false);
			}
		}

		setIsCompiling(true);
		setActiveCompiler('typst');

		// setCompiledPdf(null);
		setCompiledCanvas(null);

		try {
			const result = await typstService.compileTypst(
				mainFileName,
				fileTree,
				format,
				pdfOptions,
				{ allowRemoteUrls: previewAllowRemoteUrls },
			);

			moduleLog.info('Compilation result', {
				status: result.status,
				format: result.format,
				hasPdf: !!result.pdf,
				hasSvg: !!result.svg,
				hasCanvas: !!result.canvas,
				canvasLength: result.canvas?.length,
			});

			setCompileLog(result.log);

			if (result.status === 0) {
				switch (result.format) {
					case 'pdf':
						if (result.pdf) {
							setCompiledPdf(result.pdf);
							setCurrentView('output');
							setLogIndicator('success');

							const fileName =
								mainFileName
									.split('/')
									.pop()
									?.replace(/\.typ$/i, '.pdf') || 'output.pdf';

							popoutViewerService.sendContent({
								kind: 'pdf',
								content: result.pdf,
								mimeType: 'application/pdf',
								fileName,
								projectName: getProjectName(t('Typst Project')),
							});
						}
						break;

					case 'svg':
					case 'canvas':
						if (result.canvas) {
							setCompiledCanvas(result.canvas);
							setCurrentView('output');
							setLogIndicator('success');

							const svgFileName =
								mainFileName
									.split('/')
									.pop()
									?.replace(/\.typ$/i, '.svg') || 'output.svg';

							popoutViewerService.sendContent({
								kind: 'canvas-svg',
								content: result.canvas,
								mimeType: 'image/svg+xml',
								fileName: svgFileName,
								projectName: getProjectName(t('Typst Project')),
							});
						}
						break;

					case 'canvas-pdf':
						if (result.canvas) {
							setCompiledCanvas(result.canvas);
							setCurrentView('output');
							setLogIndicator('success');

							const canvasPdfFileName =
								mainFileName
									.split('/')
									.pop()
									?.replace(/\.typ$/i, '.pdf') || 'output.pdf';

							popoutViewerService.sendContent({
								kind: 'canvas-pdf',
								content: result.canvas,
								mimeType: 'application/pdf',
								fileName: canvasPdfFileName,
								projectName: getProjectName(t('Typst Project')),
							});
						}
						break;
				}
			} else {
				setCompileError(
					t('Compilation failed. Check the log in the main window.'),
				);

				switch (result.format) {
					case 'svg':
					case 'pdf':
						setCurrentView('log');
						break;
				}

				setLogIndicator('error');
				popoutViewerService.sendCompileResult(result.status, result.log);
			}

			await refreshFileTree();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : t('Unknown error');

			setCompileError(message);
			setCurrentView('log');
			setLogIndicator('error');

			popoutViewerService.sendCompileResult(-1, message);
		} finally {
			setIsCompiling(false);
		}
	};

	const triggerAutoCompile = useCallback(() => {
		const hashUrl = window.location.hash.substring(1);
		const fragments = parseUrlFragments(hashUrl);
		const isTypstCompile = fragments.compile === 'typst';

		if (isTypstCompile) {
			const cleanUrl = hashUrl.replace(/&compile:[^&]*/, '');
			replaceHash(cleanUrl);
			document.dispatchEvent(new CustomEvent('trigger-typst-compile'));
			setHasAutoCompiled(true);
			return;
		}

		const autoCompileEnabled =
			(getSetting('typst-auto-compile-on-open')?.value as boolean) ?? false;

		if (autoCompileEnabled && !hasAutoCompiled) {
			document.dispatchEvent(new CustomEvent('trigger-typst-compile'));
			setHasAutoCompiled(true);
		}
	}, [getSetting, hasAutoCompiled]);

	const stopCompilation = () => {
		if (isCompiling) {
			typstService.stopCompilation();
			setIsCompiling(false);
			setCompileError('Compilation stopped by user');
		}
	};

	const exportDocument = async (
		mainFileName: string,
		options: {
			format?: TypstOutputFormat;
			includeLog?: boolean;
			pdfOptions?: TypstPdfOptions;
		} = {},
	): Promise<void> => {
		await typstService.exportDocument(
			mainFileName,
			fileTree,
			options.format ?? currentFormat,
			options.pdfOptions,
			options.includeLog ?? false,
			{ allowRemoteUrls: typstAllowRemoteContent },
		);
	};

	const toggleOutputView = () => {
		setCurrentView(currentView === 'log' ? 'output' : 'log');
	};

	const clearCache = () => {
		typstService.clearCache();
	};

	return (
		<TypstContext.Provider
			value={{
				isCompiling,
				isInitializing,
				compileError,
				compiledPdf,
				compiledSvg,
				compiledCanvas,
				compileLog,
				currentFormat,
				compileDocument,
				stopCompilation,
				toggleOutputView,
				currentView,
				logIndicator,
				clearCache,
				triggerAutoCompile,
				activeCompiler,
				exportDocument,
			}}
		>
			{children}
		</TypstContext.Provider>
	);
};
