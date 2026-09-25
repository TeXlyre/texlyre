// src/components/output/TypstOutput.tsx
import React from 'react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { fileStoreService } from '../../services/FileStoreService';
import { filePathCacheService } from '../../services/FilePathCacheService';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { useSourceMap } from '../../hooks/useSourceMap';
import { useProperties } from '../../hooks/useProperties';
import { useSettings } from '../../hooks/useSettings';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { RendererController } from '../../plugins/PluginInterface';
import type { FileNode } from '../../types/files';
import ResizablePanel from '../common/ResizablePanel';
import TypstCompileButton from './TypstCompileButton';
import type { TypstOutputFormat } from '../../types/typst';
import type { SourceMapClickMode } from '../../types/sourceMap';
import SourceMapFloatingButton from './SourceMapFloatingButton';
import {
	isTypstFile,
	isTemporaryFile,
	toArrayBuffer,
} from '../../utils/fileUtils';
import { gotoEditor } from '../../utils/editorNavigator';

const moduleLog = createNamedLogger('TypstOutput');

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
	className = '',
	selectedDocId,
	documents,
	onNavigateToLinkedFile,
	onExpandTypstOutput,
	linkedFileInfo,
}) => {
	const {
		compileLog,
		compileGeneration,
		compiledPdf,
		// compiledSvg,
		compiledCanvas,
		compiledCanvasSource,
		currentView,
		logIndicator,
		toggleOutputView,
		currentFormat,
		compileDocument,
		exportDocument,
	} = useTypst();

	const projectId = fileStoreService.getCurrentProjectId() || undefined;
	const { selectedFileId, getFile, fileTree } = useFileTree();
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const outputTabsRef = useWheelScroll<HTMLDivElement>();

	const [visualizerHeight, setVisualizerHeight] = useState(300);
	const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();

	const settingFormat =
		(getSetting('typst-default-format')?.value as TypstOutputFormat) ?? 'pdf';

	const propMainFile = getProperty('typst-main-file', {
		scope: 'project',
		projectId,
	}) as string | undefined;
	const propFormat = getProperty('typst-output-format', {
		scope: 'project',
		projectId,
	}) as TypstOutputFormat | undefined;

	const effectiveMainFile = propMainFile || autoMainFile;
	const effectiveFormat = propFormat || currentFormat || settingFormat;

	const {
		reverseSync,
		currentHighlight,
		isAvailable: sourceMapAvailable,
		reverseClickEnabled,
		reverseClickMode,
	} = useSourceMap();

	const canvasControllerRef = useRef<RendererController | null>(null);
	const clickCountRef = useRef(0);
	const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const useEnhancedRenderer = getSetting('pdf-renderer-enable')?.value ?? true;
	const loggerPlugin = pluginRegistry.getLoggerForType('typst');

	const indicatorColor = {
		idle: '#777',
		success: '#28a745',
		warn: '#ffc107',
		error: '#dc3545',
	}[logIndicator ?? 'idle'];

	useEffect(() => {
		if (compileGeneration > 0) canvasControllerRef.current?.cancelPending?.();
	}, [compileGeneration]);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'typst-log-visualizer-height',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: 300,
		});

		registerProperty({
			id: 'typst-log-visualizer-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});

		registerProperty({
			id: 'typst-main-file',
			category: 'Compilation',
			subcategory: 'Typst',
			defaultValue: undefined,
		});

		registerProperty({
			id: 'typst-output-format',
			category: 'Compilation',
			subcategory: 'Typst',
			defaultValue: 'pdf',
		});
	}, [registerProperty]);

	useEffect(() => {
		const findTypstFiles = (nodes: FileNode[]): string[] => {
			const typstFiles: string[] = [];

			for (const node of nodes) {
				if (
					node.type === 'file' &&
					isTypstFile(node.path) &&
					!isTemporaryFile(node.path)
				) {
					typstFiles.push(node.path);
				}

				if (node.children) {
					typstFiles.push(...findTypstFiles(node.children));
				}
			}

			return typstFiles;
		};

		const findFileById = (
			nodes: FileNode[],
			fileId: string,
		): FileNode | undefined => {
			for (const node of nodes) {
				if (node.id === fileId) return node;
				if (node.children) {
					const match = findFileById(node.children, fileId);
					if (match) return match;
				}
			}
			return undefined;
		};

		const allTypstFiles = findTypstFiles(fileTree);

		if (
			selectedDocId &&
			linkedFileInfo?.filePath &&
			isTypstFile(linkedFileInfo.filePath)
		) {
			setAutoMainFile(linkedFileInfo.filePath);
			return;
		}

		if (selectedFileId) {
			const file = findFileById(fileTree, selectedFileId);
			if (file && isTypstFile(file.path)) {
				setAutoMainFile(file.path);
				return;
			}
		}

		if (autoMainFile && allTypstFiles.includes(autoMainFile)) return;
		setAutoMainFile(allTypstFiles[0]);
	}, [fileTree, selectedFileId, selectedDocId, linkedFileInfo, autoMainFile]);

	useEffect(() => {
		const storedHeight = getProperty('typst-log-visualizer-height');
		const storedCollapsed = getProperty('typst-log-visualizer-collapsed');

		if (storedHeight !== undefined) {
			setVisualizerHeight(Number(storedHeight));
		}

		if (storedCollapsed !== undefined) {
			setVisualizerCollapsed(Boolean(storedCollapsed));
		}
	}, [getProperty]);

	const handleVisualizerResize = (height: number) => {
		setVisualizerHeight(height);
		setProperty('typst-log-visualizer-height', height);
	};

	const handleVisualizerCollapse = (collapsed: boolean) => {
		setVisualizerCollapsed(collapsed);
		setProperty('typst-log-visualizer-collapsed', collapsed);
	};

	useEffect(() => {
		if (canvasControllerRef.current?.setHighlight) {
			canvasControllerRef.current.setHighlight(currentHighlight);
		}
	}, [currentHighlight]);

	useEffect(() => {
		return () => {
			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current);
			}
		};
	}, []);

	const handleLocationClick = useCallback(
		(page: number, x: number, y: number) => {
			if (!reverseClickEnabled) return;

			clickCountRef.current++;

			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current);
			}

			clickTimerRef.current = setTimeout(() => {
				const required: Record<SourceMapClickMode, number> = {
					single: 1,
					double: 2,
					triple: 3,
				};

				if (clickCountRef.current >= required[reverseClickMode]) {
					reverseSync(page, x, y);
				}

				clickCountRef.current = 0;
			}, 300);
		},
		[reverseClickEnabled, reverseClickMode, reverseSync],
	);

	const handleLineClick = async (line: number, filePath?: string) => {
		try {
			if (filePath) {
				const targetFile = await filePathCacheService.findFileByPath(
					effectiveMainFile ?? '',
					filePath,
				);
				if (!targetFile) {
					moduleLog.warn(`Diagnostic file not found: ${filePath}`);
					return;
				}

				const target = targetFile.documentId
					? { kind: 'document' as const, documentId: targetFile.documentId }
					: { kind: 'file' as const, fileId: targetFile.id };
				const isCurrent = targetFile.documentId
					? selectedDocId === targetFile.documentId
					: selectedFileId === targetFile.id;

				if (isCurrent) {
					gotoEditor(target, { line });
				} else {
					gotoEditor(target, { line }, { waitForReady: true });
					document.dispatchEvent(
						new CustomEvent('navigate-to-compiled-file', {
							detail: { filePath: targetFile.path },
						}),
					);
				}
				return;
			}

			if (!selectedFileId) return;
			const file = await getFile(selectedFileId);
			if (!file || !isTypstFile(file.path)) return;
			gotoEditor({ kind: 'file', fileId: selectedFileId }, { line });
		} catch (error) {
			moduleLog.error('Error handling line click:', error);
		}
	};

	const handleSavePdf = useCallback(
		(fileName: string) => {
			if (!compiledPdf) return;

			const blob = new Blob([toArrayBuffer(compiledPdf)], {
				type: 'application/pdf',
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		},
		[compiledPdf],
	);

	const resolveCompileTarget = useCallback(async (): Promise<
		string | undefined
	> => {
		if (effectiveMainFile) {
			return effectiveMainFile;
		}

		if (
			selectedDocId &&
			linkedFileInfo?.filePath &&
			isTypstFile(linkedFileInfo.filePath)
		) {
			return linkedFileInfo.filePath;
		}

		if (selectedFileId) {
			const file = await getFile(selectedFileId);

			if (file && isTypstFile(file.path)) {
				return file.path;
			}
		}

		return undefined;
	}, [
		effectiveMainFile,
		selectedDocId,
		linkedFileInfo,
		selectedFileId,
		getFile,
	]);

	const handleDownloadCanvasSvg = useCallback(
		async (_fileName: string) => {
			const mainFile = await resolveCompileTarget();
			if (!mainFile) return;
			await exportDocument(mainFile, { format: 'svg' });
		},
		[resolveCompileTarget, exportDocument],
	);

	const handleTabSwitch = useCallback(
		async (format: TypstOutputFormat) => {
			if (effectiveFormat === format) return;

			setProperty('typst-output-format', format, {
				scope: 'project',
				projectId,
			});

			const mainFile = await resolveCompileTarget();

			if (mainFile) {
				await compileDocument(mainFile, format);
			}
		},
		[
			effectiveFormat,
			setProperty,
			projectId,
			resolveCompileTarget,
			compileDocument,
		],
	);

	const outputViewerContent = useMemo(() => {
		if (effectiveFormat === 'pdf' && compiledPdf) {
			const pdfRenderer = pluginRegistry.getRendererForOutput(
				'pdf',
				'pdf-renderer',
			);
			return (
				<div className='pdf-viewer'>
					{pdfRenderer && useEnhancedRenderer ? (
						React.createElement(pdfRenderer.renderOutput, {
							content: toArrayBuffer(compiledPdf.buffer),
							mimeType: 'application/pdf',
							fileName: 'output.pdf',
							onSave: handleSavePdf,
						})
					) : (
						<embed
							src={URL.createObjectURL(
								new Blob([toArrayBuffer(compiledPdf)], {
									type: 'application/pdf',
								}),
							)}
							type='application/pdf'
							style={{ width: '100%', height: '100%' }}
						/>
					)}
				</div>
			);
		}

		if (effectiveFormat === 'canvas' || effectiveFormat === 'canvas-pdf') {
			const canvasRenderer = pluginRegistry.getRendererForOutput(
				'canvas',
				'canvas-renderer',
			);

			return (
				<div className='canvas-viewer'>
					{canvasRenderer ? (
						React.createElement(canvasRenderer.renderOutput, {
							content: compiledCanvas || new ArrayBuffer(0),
							pagedSource:
								effectiveFormat === 'canvas'
									? (compiledCanvasSource ?? undefined)
									: undefined,
							mimeType:
								effectiveFormat === 'canvas-pdf'
									? 'application/pdf'
									: 'application/x-texlyre-typst-vector',
							fileName:
								effectiveFormat === 'canvas-pdf' ? 'output.pdf' : 'output.svg',
							controllerRef: (controller) => {
								canvasControllerRef.current = controller;
							},
							onDownload:
								effectiveFormat === 'canvas'
									? handleDownloadCanvasSvg
									: undefined,
							onLocationClick: handleLocationClick,
						})
					) : (
						<div className='canvas-fallback'>
							{t('Canvas renderer not available')}
						</div>
					)}
				</div>
			);
		}

		return null;
	}, [
		effectiveFormat,
		compiledPdf,
		// compiledSvg,
		compiledCanvas,
		compiledCanvasSource,
		useEnhancedRenderer,
		handleSavePdf,
		handleDownloadCanvasSvg,
		handleLocationClick,
	]);

	const hasAnyOutput = compiledPdf || compiledCanvas;

	return (
		<div className={`ui-viewer ${className}`} data-role='typeset-output'>
			<div className='ui-panel-header' data-role='output' data-shrink='true'>
				<div
					className='ui-tab-list scroll-x'
					data-role='output'
					data-variant='switcher'
					ref={outputTabsRef}
				>
					<button
						type='button'
						className={`ui-tab ${currentView === 'log' ? 'active' : ''}`}
						onClick={() => currentView !== 'log' && toggleOutputView()}
					>
						<div
							className='ui-status-dot'
							style={{ backgroundColor: indicatorColor }}
						/>
						{t('Log')}
					</button>
					{currentView === 'output' && (
						<>
							<button
								type='button'
								className={`ui-tab ${currentView === 'output' && effectiveFormat === 'pdf' ? 'active' : ''}`}
								onClick={() => handleTabSwitch('pdf')}
							>
								{t('PDF')}
							</button>

							<button
								type='button'
								className={`ui-tab ${currentView === 'output' && effectiveFormat === 'canvas-pdf' ? 'active' : ''}`}
								onClick={() => handleTabSwitch('canvas-pdf')}
							>
								{t('Canvas (PDF)')}
							</button>
							<button
								type='button'
								className={`ui-tab ${currentView === 'output' && effectiveFormat === 'canvas' ? 'active' : ''}`}
								onClick={() => handleTabSwitch('canvas')}
							>
								{t('Canvas (SVG)')}
							</button>
						</>
					)}
					{currentView === 'log' && (
						<button
							type='button'
							className='ui-tab'
							onClick={() => toggleOutputView()}
							disabled={!hasAnyOutput}
						>
							{t('Output')}
						</button>
					)}
				</div>
				<TypstCompileButton
					dropdownKey={'typst-output-dropdown'}
					className='output-compile-button'
					selectedDocId={selectedDocId}
					documents={documents}
					onNavigateToLinkedFile={onNavigateToLinkedFile}
					onExpandTypstOutput={onExpandTypstOutput}
					linkedFileInfo={linkedFileInfo}
					shouldNavigateOnCompile={false}
					useSharedSettings={false}
				/>
			</div>

			{!compileLog && !hasAnyOutput ? (
				<div className='empty-state ui-empty-state'>
					<p>
						{t(
							'No output available. Compile a {typesetter} document to see results.',
							{ typesetter: t('Typst') },
						)}
					</p>
				</div>
			) : (
				<>
					{currentView === 'log' && (
						<div className='log-view-container'>
							{loggerPlugin ? (
								<div className='split-log-view'>
									<ResizablePanel
										direction='vertical'
										alignment='end'
										height={visualizerHeight}
										minHeight={150}
										maxHeight={600}
										className='visualizer-panel-wrapper'
										onResize={handleVisualizerResize}
										collapsed={visualizerCollapsed}
										onCollapse={handleVisualizerCollapse}
									>
										<div className='visualizer-panel'>
											{React.createElement(loggerPlugin.renderVisualizer, {
												log: compileLog,
												onLineClick: handleLineClick,
											})}
										</div>
									</ResizablePanel>
									<div className='raw-log-panel'>
										<pre className='log-viewer ui-code-block' data-wrap='true'>
											{compileLog}
										</pre>
									</div>
								</div>
							) : (
								<div className='log-viewer ui-code-block' data-wrap='true'>
									<pre>{compileLog}</pre>
								</div>
							)}
						</div>
					)}

					<div
						style={{ display: currentView === 'output' ? 'contents' : 'none' }}
					>
						{outputViewerContent}
					</div>
				</>
			)}

			{sourceMapAvailable && (
				<SourceMapFloatingButton
					onForwardSync={() => {
						document.dispatchEvent(
							new CustomEvent('trigger-sourcemap-forward'),
						);
					}}
				/>
			)}
		</div>
	);
};

export default TypstOutput;
