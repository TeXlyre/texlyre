// src/components/output/ExternalCompilerOutput.tsx
import type React from 'react';
import { createElement, useCallback, useEffect, useMemo, useRef } from 'react';

import { t } from '@/i18n';
import { fileStorageService } from '../../services/FileStorageService';
import { useExternalCompiler } from '../../hooks/useExternalCompiler';
import { useFileTree } from '../../hooks/useFileTree';
import { useProperties } from '../../hooks/useProperties';
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

	const projectId = fileStorageService.getCurrentProjectId() || undefined;
	const { fileTree, selectedFileId, getFile } = useFileTree();
	const { getProperty, setProperty } = useProperties();
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

	const formatField = useMemo(
		() => provider.ui?.compile?.fields?.find((f) => f.sendAs === 'format'),
		[provider.ui?.compile?.fields],
	);
	const formatPropertyId = formatField
		? `external-${provider.id}-${formatField.key}`
		: undefined;

	const propFormat = formatPropertyId
		? (getProperty(formatPropertyId, { scope: 'project', projectId }) as
				| string
				| undefined)
		: undefined;

	const effectiveFormat = propFormat || outputFormat || tabs[0]?.format;

	useEffect(() => {
		rendererControllerRef.current?.setHighlight?.(currentHighlight);
	}, [currentHighlight]);

	useEffect(() => {
		return () => {
			if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
		};
	}, []);

	const sharedContent = useMemo(
		() => (compiledOutput ? toArrayBuffer(compiledOutput.buffer) : null),
		[compiledOutput],
	);

	const resolveCompileTarget = useCallback(async (): Promise<
		string | undefined
	> => {
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
			if (effectiveFormat === format) return;

			if (formatPropertyId) {
				setProperty(formatPropertyId, format, {
					scope: 'project',
					projectId,
				});
			}

			const mainFile = await resolveCompileTarget();

			if (mainFile) {
				await compileDocument(provider.id, mainFile, format);
			}
		},
		[
			effectiveFormat,
			formatPropertyId,
			setProperty,
			projectId,
			resolveCompileTarget,
			compileDocument,
			provider.id,
		],
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

	const outputViewerContent = useMemo(() => {
		if (!compiledOutput) return null;

		const format = provider.outputFormats.find((f) => f.id === effectiveFormat);
		const renderer = pluginRegistry.getRendererForOutput(
			format?.outputType ?? effectiveFormat ?? '',
			format?.rendererPluginId,
		);
		const mimeType = outputMimeType ?? format?.mimeType;

		return (
			<div className='pdf-viewer'>
				{renderer ? (
					createElement(renderer.renderOutput, {
						content: sharedContent ?? new ArrayBuffer(0),
						mimeType,
						fileName: `output.${outputExtension(mimeType, effectiveFormat ?? '')}`,
						onLocationClick: handleLocationClick,
						controllerRef: (controller: RendererController | null) => {
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
	}, [
		compiledOutput,
		provider.outputFormats,
		effectiveFormat,
		outputMimeType,
		sharedContent,
		handleLocationClick,
		currentHighlight,
	]);

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

export default ExternalCompilerOutput;
