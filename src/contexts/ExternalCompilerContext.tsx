// src/contexts/ExternalCompilerContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useCallback, useState } from 'react';

import { useFileTree } from '../hooks/useFileTree';
import { compilerRegistryService } from '../services/CompilerRegistryService';
import { fileStorageService } from '../services/FileStorageService';
import {
	type PopoutContentKind,
	popoutViewerService,
} from '../services/PopoutViewerService';
import {
	genericTypesetterService,
	type TypesetterFile,
} from '../services/GenericTypesetterService';
import type { FileNode } from '../types/files';
import { type DownloadableFile, downloadFiles } from '../utils/zipUtils';
import { getProjectName } from '../utils/urlUtils';
import { toBytes } from '../utils/fileUtils';

interface ExternalExportOptions {
	includeLog?: boolean;
	options?: Record<string, string | number | boolean>;
}

interface ExternalCompilerContextType {
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

export const ExternalCompilerContext =
	createContext<ExternalCompilerContextType | null>(null);

interface ExternalCompilerProviderProps {
	children: ReactNode;
}

const collectFiles = (nodes: FileNode[]): FileNode[] => {
	const result: FileNode[] = [];
	for (const node of nodes) {
		if (node.type === 'file') result.push(node);
		if (node.children?.length) result.push(...collectFiles(node.children));
	}
	return result;
};

const getBaseName = (filePath: string): string => {
	const name = filePath.split('/').pop() || filePath;
	return name.replace(/\.[^.]+$/, '');
};

export const ExternalCompilerProvider: React.FC<
	ExternalCompilerProviderProps
> = ({ children }) => {
	const { fileTree } = useFileTree();
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
		const nodes = collectFiles(fileTree);
		const files: TypesetterFile[] = [];
		for (const node of nodes) {
			let content = node.content;
			if (content === undefined) {
				try {
					const raw = await fileStorageService.getFile(node.id);
					content = raw?.content;
				} catch {
					content = undefined;
				}
			}
			if (content === undefined) continue;
			files.push({
				path: node.path,
				content: toBytes(content),
				lastModified: node.lastModified,
			});
		}
		return files;
	}, [fileTree]);

	const compileDocument = useCallback(
		async (
			providerId: string,
			mainFileName: string,
			format = 'pdf',
			options?: Record<string, string | number | boolean>,
		) => {
			const provider = compilerRegistryService.get(providerId);
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
					const resolvedFormat = result.format || format;
					const outputFormat = provider.outputFormats.find(
						(f) => f.id === resolvedFormat,
					);
					const mimeType =
						result.mimeType ?? outputFormat?.mimeType ?? 'application/pdf';

					setCompiledOutput(result.output);
					setOutputMimeType(result.mimeType ?? null);
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
					setLogIndicator('error');
					setCurrentView('log');
					popoutViewerService.sendCompileResult(result.status, result.log);
				}
			} catch (error) {
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
			const provider = compilerRegistryService.get(providerId);
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
						name: `${baseName}.${result.format || format}`,
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
		<ExternalCompilerContext.Provider
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
		</ExternalCompilerContext.Provider>
	);
};
