// src/components/output/ExternalCompilerOutput.tsx
import type React from 'react';
import {
	createElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { t } from '@/i18n';
import { useExternalCompiler } from '../../hooks/useExternalCompiler';
import { useFileTree } from '../../hooks/useFileTree';
import { useSourceMap } from '../../hooks/useSourceMap';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { RendererController } from '../../plugins/PluginInterface';
import type { CompilerProvider } from '../../types/compilation';
import type { SourceMapClickMode } from '../../types/sourceMap';
import { toArrayBuffer } from '../../utils/fileUtils';
import ExternalCompileButton from './ExternalCompileButton';
import SourceMapFloatingButton from './SourceMapFloatingButton';
import {
	findInputFiles,
	outputExtension,
	resolveLabel,
} from '../../utils/compilerUtils';

interface ExternalCompilerOutputProps {
	provider: CompilerProvider;
	className?: string;
	onExpandExternalOutput?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
	} | null;
}

const indicatorColor: Record<string, string> = {
	idle: '#777',
	success: '#28a745',
	warn: '#ffc107',
	error: '#dc3545',
};

const ExternalCompilerOutput: React.FC<ExternalCompilerOutputProps> = ({
	provider,
	className = '',
	onExpandExternalOutput,
	linkedFileInfo,
}) => {
	const {
		compileError,
		compileLog,
		compiledOutput,
		outputMimeType,
		outputFormat,
		currentView,
		logIndicator,
		toggleOutputView,
		compileDocument,
	} = useExternalCompiler();
	const { fileTree, selectedFileId, getFile } = useFileTree();
	const {
		reverseSync,
		currentHighlight,
		isAvailable: sourceMapAvailable,
		reverseClickEnabled,
		reverseClickMode,
	} = useSourceMap();

	const rendererControllerRef = useRef<RendererController | null>(null);
	const clickCountRef = useRef(0);
	const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const tabs = useMemo(() => {
		if (provider.ui?.renderers?.length) {
			return provider.ui.renderers.map((renderer) => ({
				format: renderer.format,
				label: resolveLabel(renderer.label),
			}));
		}
		return provider.outputFormats.map((format) => ({
			format: format.id,
			label: format.id.toUpperCase(),
		}));
	}, [provider.ui?.renderers, provider.outputFormats]);

	const [activeFormat, setActiveFormat] = useState<string | undefined>();

	useEffect(() => {
		if (outputFormat) setActiveFormat(outputFormat);
	}, [outputFormat]);

	useEffect(() => {
		rendererControllerRef.current?.setHighlight?.(currentHighlight);
	}, [currentHighlight]);

	useEffect(() => {
		return () => {
			if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
		};
	}, []);

	const effectiveFormat = activeFormat ?? outputFormat ?? tabs[0]?.format;

	const sharedContent = useMemo(
		() => (compiledOutput ? toArrayBuffer(compiledOutput.buffer) : null),
		[compiledOutput],
	);

	const resolveMainFile = useCallback(async (): Promise<string | undefined> => {
		const matches = findInputFiles(fileTree, provider.inputExtensions);
		if (linkedFileInfo?.filePath && matches.includes(linkedFileInfo.filePath)) {
			return linkedFileInfo.filePath;
		}
		if (selectedFileId) {
			const file = await getFile(selectedFileId);
			if (file && matches.includes(file.path)) return file.path;
		}
		return matches[0];
	}, [
		fileTree,
		provider.inputExtensions,
		linkedFileInfo,
		selectedFileId,
		getFile,
	]);

	const handleTabSwitch = useCallback(
		async (format: string) => {
			setActiveFormat(format);
			if (!compiledOutput) {
				const mainFile = await resolveMainFile();
				if (mainFile) await compileDocument(provider.id, mainFile, format);
			}
		},
		[compiledOutput, resolveMainFile, compileDocument, provider.id],
	);

	const handleLocationClick = useCallback(
		(page: number, x: number, y: number) => {
			if (!reverseClickEnabled) return;

			clickCountRef.current++;

			if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

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

	const hasOutput = !!compiledOutput;

	return (
		<div
			className={`external-output ${className}`}
			style={{ position: 'relative' }}
		>
			<div className='output-header'>
				<div className='view-tabs'>
					<button
						className={`tab-button ${currentView === 'log' ? 'active' : ''}`}
						onClick={() => currentView !== 'log' && toggleOutputView()}
					>
						<div
							className='status-dot'
							style={{
								backgroundColor: indicatorColor[logIndicator ?? 'idle'],
							}}
						/>
						{t('Log')}
					</button>

					{currentView === 'output' &&
						tabs.map((tab) => (
							<button
								key={tab.format}
								className={`tab-button ${effectiveFormat === tab.format ? 'active' : ''}`}
								onClick={() => handleTabSwitch(tab.format)}
							>
								{tab.label}
							</button>
						))}

					{currentView === 'log' && (
						<button
							className='tab-button'
							onClick={() => toggleOutputView()}
							disabled={!hasOutput}
						>
							{t('Output')}
						</button>
					)}
				</div>

				<ExternalCompileButton
					provider={provider}
					className='output-compile-button'
					onExpandExternalOutput={onExpandExternalOutput}
					linkedFileInfo={linkedFileInfo}
				/>
			</div>

			{compileError && <div className='compile-error'>{compileError}</div>}

			{!compileLog && !hasOutput ? (
				<div className='empty-state'>
					<p>
						{t(
							'No output available. Compile a {typesetter} document to see results.',
							{
								typesetter: provider.label,
							},
						)}
					</p>
				</div>
			) : (
				<>
					{currentView === 'log' && (
						<div className='log-view-container'>
							<div className='log-viewer'>
								<pre>{compileLog}</pre>
							</div>
						</div>
					)}

					{hasOutput &&
						tabs.map((tab) => {
							const format = provider.outputFormats.find(
								(f) => f.id === tab.format,
							);
							const renderer = pluginRegistry.getRendererForOutput(
								format?.outputType ?? tab.format,
								format?.rendererPluginId,
							);
							const visible =
								currentView === 'output' && effectiveFormat === tab.format;

							return (
								<div
									key={tab.format}
									className='pdf-viewer'
									style={{ display: visible ? 'flex' : 'none' }}
								>
									{renderer ? (
										createElement(renderer.renderOutput, {
											content: sharedContent ?? new ArrayBuffer(0),
											mimeType: outputMimeType ?? format?.mimeType,
											fileName: `output.${outputExtension(outputMimeType ?? format?.mimeType, tab.format)}`,
											onLocationClick: handleLocationClick,
											controllerRef: (
												controller: RendererController | null,
											) => {
												rendererControllerRef.current = controller;
												controller?.setHighlight?.(currentHighlight);
											},
										})
									) : (
										<div className='canvas-fallback'>
											{t('Renderer not available for this output')}
										</div>
									)}
								</div>
							);
						})}
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

export default ExternalCompilerOutput;
