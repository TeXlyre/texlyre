// src/contexts/ExternalTypesetterContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useCallback, useState } from 'react';

import { typesetterRegistryService } from '../services/TypesetterRegistryService';
import { fileStoreService } from '../services/FileStoreService';
import { filePathCacheService } from '../services/FilePathCacheService';
import { latexSourceMapService } from '../services/LaTeXSourceMapService';
import {
	type PopoutContentKind,
	popoutViewerService,
} from '../services/PopoutViewerService';
import {
	genericTypesetterService,
	type TypesetterFile,
} from '../services/GenericTypesetterService';
import { type DownloadableFile, downloadFiles } from '../utils/archiveUtils';
import { findCompileArtifact, outputExtension } from '../utils/compilerUtils';
import { getProjectName } from '../utils/urlUtils';
import { toBytes } from '../utils/fileUtils';
import { cleanBytes } from '../utils/fileCommentUtils';

interface ExternalExportOptions {
	includeLog?: boolean;
	options?: Record<string, string | number | boolean>;
}

interface ExternalTypesetterContextType {
	isCompiling: boolean;
	isExporting: boolean;
	compileError: string | null;
	compileLog: string;
	compiledOutput: Uint8Array | null;
	outputMimeType: string | null;
	outputFormat: string | null;
	currentView: 'log' | 'output';
	logIndicator: 'idle' | 'success' | 'error';
	toggleOutputView: () => void;
	compileDocument: (
		providerId: string,
		mainFileName: string,
		format?: string,
		options?: Record<string, string | number | boolean>,
	) => Promise<void>;
	exportDocument: (
		providerId: string,
		mainFileName: string,
		format?: string,
		exportOptions?: ExternalExportOptions,
	) => Promise<void>;
	clearCache: (providerId: string) => Promise<void>;
}

export const ExternalTypesetterContext =
	createContext<ExternalTypesetterContextType | null>(null);

interface ExternalTypesetterProviderProps {
	children: ReactNode;
}

const getBaseName = (filePath: string): string => {
	const name = filePath.split('/').pop() || filePath;
	return name.replace(/\.[^.]+$/, '');
};

export const ExternalTypesetterProvider: React.FC<
	ExternalTypesetterProviderProps
> = ({ children }) => {
	const [isCompiling, setIsCompiling] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [compileError, setCompileError] = useState<string | null>(null);
	const [compileLog, setCompileLog] = useState('');
	const [compiledOutput, setCompiledOutput] = useState<Uint8Array | null>(null);
	const [outputMimeType, setOutputMimeType] = useState<string | null>(null);
	const [outputFormat, setOutputFormat] = useState<string | null>(null);
	const [currentView, setCurrentView] = useState<'log' | 'output'>('log');
	const [logIndicator, setLogIndicator] = useState<
		'idle' | 'success' | 'error'
	>('idle');

	const toggleOutputView = useCallback(() => {
		setCurrentView((view) => (view === 'log' ? 'output' : 'log'));
	}, []);

	const loadFiles = useCallback(async (): Promise<TypesetterFile[]> => {
		const nodes = await fileStoreService.getAllFiles(false, false, true);
		const files: TypesetterFile[] = [];

		for (const node of nodes) {
			if (node.type !== 'file' || node.content === undefined) continue;

			files.push({
				path: node.path,
				content: node.isBinary
					? toBytes(node.content)
					: cleanBytes(node.content),
				lastModified: node.lastModified,
			});
		}

		return files;
	}, []);

	const compileDocument = useCallback(
		async (
			providerId: string,
			mainFileName: string,
			format = 'pdf',
			options?: Record<string, string | number | boolean>,
		) => {
			const provider = typesetterRegistryService.get(providerId);
			if (!provider) {
				setCompileError(`Compiler not found: ${providerId}`);
				return;
			}

			setIsCompiling(true);
			setCompileError(null);

			try {
				const files = await loadFiles();
				const result = await genericTypesetterService.compile(providerId, {
					mainFile: mainFileName,
					format,
					files,
					options,
				});

				setCompileLog(result.log);

				if (result.status === 0 && result.output) {
					document.dispatchEvent(
						new CustomEvent('compiler-active', {
							detail: { type: 'latex' },
						}),
					);

					const synctex = findCompileArtifact(result.artifacts, 'synctex', [
						'.synctex',
						'.synctex.gz',
					]);

					if (synctex) {
						filePathCacheService.setMainFilePath(mainFileName);
						latexSourceMapService.loadFromBytes(synctex.data);
					} else {
						latexSourceMapService.clear();
					}

					const resolvedFormat = result.format || format;
					const outputFormat = provider.outputFormats.find(
						(f) => f.id === resolvedFormat,
					);
					const mimeType =
						result.mimeType ?? outputFormat?.mimeType ?? 'application/pdf';

					setCompiledOutput(result.output);
					setOutputMimeType(mimeType);
					setOutputFormat(resolvedFormat);
					setCurrentView('output');
					setLogIndicator('success');

					const kind: PopoutContentKind =
						outputFormat?.outputType === 'canvas'
							? mimeType === 'image/svg+xml'
								? 'canvas-svg'
								: 'canvas-pdf'
							: 'pdf';

					const extension = mimeType === 'image/svg+xml' ? 'svg' : 'pdf';

					popoutViewerService.sendContent({
						kind,
						content: result.output,
						mimeType,
						fileName: `${getBaseName(mainFileName)}.${extension}`,
						projectName: getProjectName(),
					});
				} else {
					latexSourceMapService.clear();
					setLogIndicator('error');
					setCurrentView('log');
					popoutViewerService.sendCompileResult(result.status, result.log);
				}
			} catch (error) {
				latexSourceMapService.clear();
				const message = error instanceof Error ? error.message : String(error);
				setCompileError(message);
				setLogIndicator('error');
				setCurrentView('log');
				popoutViewerService.sendCompileResult(-1, message);
			} finally {
				setIsCompiling(false);
			}
		},
		[loadFiles],
	);

	const exportDocument = useCallback(
		async (
			providerId: string,
			mainFileName: string,
			format = 'pdf',
			exportOptions: ExternalExportOptions = {},
		) => {
			const provider = typesetterRegistryService.get(providerId);
			if (!provider) {
				setCompileError(`Compiler not found: ${providerId}`);
				return;
			}

			setIsExporting(true);
			setCompileError(null);

			try {
				const files = await loadFiles();
				const result = await genericTypesetterService.compile(providerId, {
					mainFile: mainFileName,
					format,
					files,
					options: { ...(exportOptions.options ?? {}), export: true },
				});

				setCompileLog(result.log);

				if (result.status !== 0 || !result.output) {
					setLogIndicator('error');
					setCurrentView('log');
					return;
				}

				const baseName = getBaseName(mainFileName);
				const mimeType =
					result.mimeType ??
					provider.outputFormats.find((f) => f.id === result.format)
						?.mimeType ??
					'application/octet-stream';

				const downloads: DownloadableFile[] = [
					{
						content: result.output,
						name: `${baseName}.${outputExtension(result.mimeType, result.format || format)}`,
						mimeType,
					},
				];

				if (exportOptions.includeLog) {
					downloads.push({
						content: new TextEncoder().encode(result.log),
						name: `${baseName}.log`,
						mimeType: 'text/plain',
					});
				}

				await downloadFiles(downloads, baseName);
				setLogIndicator('success');
			} catch (error) {
				setCompileError(error instanceof Error ? error.message : String(error));
				setLogIndicator('error');
				setCurrentView('log');
			} finally {
				setIsExporting(false);
			}
		},
		[loadFiles],
	);

	const clearCache = useCallback(async (providerId: string) => {
		try {
			genericTypesetterService.resetSyncState(providerId);
			await genericTypesetterService.compile(providerId, {
				mainFile: '',
				format: '',
				files: [],
				options: { action: 'clear-cache' },
			});
		} catch (error) {
			setCompileError(error instanceof Error ? error.message : String(error));
		}
	}, []);

	return (
		<ExternalTypesetterContext.Provider
			value={{
				isCompiling,
				isExporting,
				compileError,
				compileLog,
				compiledOutput,
				outputMimeType,
				outputFormat,
				currentView,
				logIndicator,
				toggleOutputView,
				compileDocument,
				exportDocument,
				clearCache,
			}}
		>
			{children}
		</ExternalTypesetterContext.Provider>
	);
};
