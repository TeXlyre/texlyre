// src/contexts/TypstContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { createTypstPagedPreviewSource } from '../extensions/typst.ts/TypstPagedPreviewSource';
import { useFileTree } from '../hooks/useFileTree';
import { useSettings } from '../hooks/useSettings';
import { popoutViewerService } from '../services/PopoutViewerService';
import { typstService } from '../services/TypstService';
import type {
	TypstContextType,
	TypstOutputFormat,
	TypstPdfOptions,
} from '../types/typst';
import {
	getProjectName,
	parseUrlFragments,
	replaceHash,
} from '../utils/urlUtils';

const moduleLog = createNamedLogger('TypstContext');

export const TypstContext = createContext<TypstContextType | null>(null);

interface TypstProviderProps {
	children: ReactNode;
}

export const TypstProvider: React.FC<TypstProviderProps> = ({ children }) => {
	const { fileTree } = useFileTree();
	const { getSetting } = useSettings();
	const requestRef = useRef(0);
	const canvasSourceRef =
		useRef<TypstContextType['compiledCanvasSource']>(null);

	const [isCompiling, setIsCompiling] = useState(false);
	const [compileGeneration, setCompileGeneration] = useState(0);
	const [isInitializing, setIsInitializing] = useState(false);
	const [hasAutoCompiled, setHasAutoCompiled] = useState(false);
	const [compileError, setCompileError] = useState<string | null>(null);
	const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
	const [compiledSvg] = useState<string | null>(null);
	const [compiledCanvas, setCompiledCanvas] = useState<Uint8Array | null>(null);
	const [compiledCanvasSource, setCompiledCanvasSource] =
		useState<TypstContextType['compiledCanvasSource']>(null);
	const [compileLog, setCompileLog] = useState('');
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

	useEffect(
		() => () => {
			canvasSourceRef.current?.dispose?.();
		},
		[],
	);

	const replaceCanvasSource = useCallback(
		(next: TypstContextType['compiledCanvasSource']) => {
			const previous = canvasSourceRef.current;
			canvasSourceRef.current = next;
			setCompiledCanvasSource(next);
			if (previous && previous !== next) previous.dispose?.();
		},
		[],
	);

	const compileDocument = async (
		mainFileName: string,
		format: TypstOutputFormat = currentFormat,
		pdfOptions?: TypstPdfOptions,
	): Promise<void> => {
		const requestId = ++requestRef.current;
		setCompileGeneration(requestId);
		setCompileError(null);

		moduleLog.info('compileDocument called', {
			mainFileName,
			format,
			pdfOptions,
			allowRemoteUrls: previewAllowRemoteUrls,
		});

		if (!typstService.isReady()) {
			setIsInitializing(true);
			try {
				await typstService.initialize();
			} catch (error) {
				if (requestId !== requestRef.current) return;
				const message =
					error instanceof Error ? error.message : t('Unknown error');
				setCompileError(message);
				setCurrentView('log');
				setLogIndicator('error');
				popoutViewerService.sendCompileResult(-1, message);
				return;
			} finally {
				if (requestId === requestRef.current) setIsInitializing(false);
			}
		}

		setIsCompiling(true);
		setActiveCompiler('typst');

		try {
			const result = await typstService.compileTypst(
				mainFileName,
				fileTree,
				format,
				pdfOptions,
				{ allowRemoteUrls: previewAllowRemoteUrls },
			);

			if (requestId !== requestRef.current) return;
			setCompileLog(result.log);

			if (result.status !== 0) {
				setCompileError(
					t('Compilation failed. Check the log in the main window.'),
				);
				if (result.format === 'svg' || result.format === 'pdf') {
					setCurrentView('log');
				}
				setLogIndicator('error');
				popoutViewerService.sendCompileResult(result.status, result.log);
				return;
			}

			switch (result.format) {
				case 'pdf':
					if (!result.pdf) break;
					startTransition(() => {
						replaceCanvasSource(null);
						setCompiledPdf(result.pdf!);
						setCurrentView('output');
						setLogIndicator('success');
					});
					popoutViewerService.sendContent({
						kind: 'pdf',
						content: result.pdf,
						mimeType: 'application/pdf',
						fileName:
							mainFileName
								.split('/')
								.pop()
								?.replace(/\.typ$/i, '.pdf') || 'output.pdf',
						projectName: getProjectName(t('Typst Project')),
					});
					break;

				case 'canvas':
					if (!result.canvas) break;
					{
						const source = createTypstPagedPreviewSource(result.canvas, {
							allowRemoteUrls: previewAllowRemoteUrls,
						});
						startTransition(() => {
							setCompiledCanvas(result.canvas!);
							replaceCanvasSource(source);
							setCurrentView('output');
							setLogIndicator('success');
						});
						popoutViewerService.sendContent({
							kind: 'canvas-svg',
							content: result.canvas,
							mimeType: 'application/x-texlyre-typst-vector',
							fileName:
								mainFileName
									.split('/')
									.pop()
									?.replace(/\.typ$/i, '.svg') || 'output.svg',
							projectName: getProjectName(t('Typst Project')),
						});
					}
					break;

				case 'canvas-pdf':
					if (!result.canvas) break;
					startTransition(() => {
						replaceCanvasSource(null);
						setCompiledCanvas(result.canvas!);
						setCurrentView('output');
						setLogIndicator('success');
					});
					popoutViewerService.sendContent({
						kind: 'canvas-pdf',
						content: result.canvas,
						mimeType: 'application/pdf',
						fileName:
							mainFileName
								.split('/')
								.pop()
								?.replace(/\.typ$/i, '.pdf') || 'output.pdf',
						projectName: getProjectName(t('Typst Project')),
					});
					break;

				case 'svg':
					break;
			}
		} catch (error) {
			if (requestId !== requestRef.current) return;
			const message =
				error instanceof Error ? error.message : t('Unknown error');
			setCompileError(message);
			setCurrentView('log');
			setLogIndicator('error');
			popoutViewerService.sendCompileResult(-1, message);
		} finally {
			if (requestId === requestRef.current) setIsCompiling(false);
		}
	};

	const triggerAutoCompile = useCallback(() => {
		const hashUrl = window.location.hash.substring(1);
		const fragments = parseUrlFragments(hashUrl);
		if (fragments.compile === 'typst') {
			replaceHash(hashUrl.replace(/&compile:[^&]*/, ''));
			document.dispatchEvent(new CustomEvent('trigger-typst-compile'));
			setHasAutoCompiled(true);
			return;
		}

		const enabled =
			(getSetting('typst-auto-compile-on-open')?.value as boolean) ?? false;
		if (enabled && !hasAutoCompiled) {
			document.dispatchEvent(new CustomEvent('trigger-typst-compile'));
			setHasAutoCompiled(true);
		}
	}, [getSetting, hasAutoCompiled]);

	const stopCompilation = () => {
		if (!isCompiling) return;
		requestRef.current += 1;
		typstService.stopCompilation();
		setIsCompiling(false);
		setCompileError(t('Compilation stopped by user'));
	};

	const exportDocument: TypstContextType['exportDocument'] = async (
		mainFileName,
		options = {},
	) => {
		await typstService.exportDocument(
			mainFileName,
			fileTree,
			options.format ?? currentFormat,
			options.pdfOptions,
			options.includeLog ?? false,
			{ allowRemoteUrls: typstAllowRemoteContent },
		);
	};

	return (
		<TypstContext.Provider
			value={{
				isCompiling,
				compileGeneration,
				isInitializing,
				compileError,
				compiledPdf,
				compiledSvg,
				compiledCanvas,
				compiledCanvasSource,
				compileLog,
				currentFormat,
				compileDocument,
				stopCompilation,
				toggleOutputView: () =>
					setCurrentView((view) => (view === 'log' ? 'output' : 'log')),
				currentView,
				logIndicator,
				clearCache: () => {
					void typstService.clearCache();
				},
				triggerAutoCompile,
				activeCompiler,
				exportDocument,
			}}
		>
			{children}
		</TypstContext.Provider>
	);
};
