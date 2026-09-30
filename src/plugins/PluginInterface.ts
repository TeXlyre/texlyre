// src/plugins/PluginInterface.ts
import type React from 'react';

import type { Setting } from '../contexts/SettingsContext';
import type { BackupStatus } from '../types/backup';
import type { BibEntry } from '../types/bibliography';
import type { GitRemoteProvider } from '../types/gitRemote';
import type { SourceMapHighlight } from '../types/sourceMap';

export interface Plugin {
	id: string;
	name: string;
	version: string;
	type: string;
	settings?: Setting[];
}

export interface SupportedExtension {
	extension: string;
	mimeType?: string;
	fileLabel?: string;
}

// Viewers
export interface ViewerPlugin extends Plugin {
	type: 'viewer';
	isEditable?: boolean;
	icon?: React.ComponentType;
	rendererPluginIds?: string[];
	rendererSizeThreshold?: number;
	canHandle: (fileType: string, mimeType?: string) => boolean;
	getSupportedExtensions?: () => SupportedExtension[];
	renderViewer: React.ComponentType<ViewerProps>;
}

export interface ViewerProps {
	fileId: string;
	content: ArrayBuffer;
	mimeType?: string;
	fileName: string;
}

export interface CollaborativeViewerPlugin extends Plugin {
	type: 'collaborative-viewer';
	canHandle: (fileType: string, mimeType?: string) => boolean;
	renderViewer: React.ComponentType<CollaborativeViewerProps>;
}

export interface CollaborativeViewerProps extends ViewerProps {
	docUrl: string;
	documentId: string;
	isDocumentSelected: boolean;
	onUpdateContent: (content: string) => void;
	parseComments?: (text: string) => unknown[];
	addComment?: (content: string) => unknown;
	updateComments?: (content: string) => void;
}

// Renderers - For rendering output from compilation processes
export interface RendererPlugin extends Plugin {
	type: 'renderer';
	canHandle: (outputType: string) => boolean;
	renderOutput: React.ComponentType<RendererProps>;
}

export interface RendererController {
	updateContent?: (content: ArrayBuffer | Uint8Array | string) => void;
	cancelPending?: () => void;
	setHighlight?: (highlight: SourceMapHighlight | null) => void;
}

export interface PagedRendererPage {
	width: number;
	height: number;
}

export interface PagedRendererNavigationTarget {
	page: number;
	x?: number;
	y?: number;
}

export interface PagedRendererSource {
	readonly id: string;
	readonly byteLength?: number;
	readonly typeLabel?: string;
	readonly mimeType?: string;
	getPages(signal?: AbortSignal): Promise<readonly PagedRendererPage[]>;
	renderPage(options: {
		page: number;
		canvas: HTMLCanvasElement;
		scale: number;
		signal: AbortSignal;
	}): Promise<void>;
	renderTextLayer?(options: {
		page: number;
		container: HTMLDivElement;
		scale: number;
		signal: AbortSignal;
		onNavigate?: (target: PagedRendererNavigationTarget) => void;
	}): Promise<void>;
	renderInteractiveLayer?(options: {
		page: number;
		container: HTMLDivElement;
		scale: number;
		signal: AbortSignal;
	}): Promise<void>;
	dispose?(): void;
}

export interface RendererProps {
	content: ArrayBuffer | Uint8Array | string;
	pagedSource?: PagedRendererSource;
	mimeType?: string;
	fileName?: string;
	headerLabel?: string;
	headerTitle?: string;
	onSave?: (fileName: string) => void;
	onDownload?: (fileName: string) => void;
	controllerRef?: (controller: RendererController | null) => void;
	onLocationClick?: (page: number, x: number, y: number) => void;
	memoryOptimized?: boolean;
}

// Loggers
export interface LoggerPlugin extends Plugin {
	type: 'logger';
	canHandle: (logType: string) => boolean;
	renderVisualizer: React.ComponentType<LoggerProps>;
}

export interface LoggerProps {
	log: string;
	onLineClick?: (line: number, file?: string) => void;
}

// Bibliography Support
export interface BibliographyPlugin extends Plugin {
	type: 'bibliography';
	icon?: React.ComponentType;
	searchMode?: 'instant' | 'on-demand';
	isEnabled(): boolean;
	getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error';
	getStatusMessage(): string;
	getSupportedFileTypes(): string[];
	getBibliographyEntries(query?: string, localEntries?: BibEntry[], perPage?: number): Promise<BibEntry[]>;
	renderPanel?: React.ComponentType<BibliographyPanelProps>;
	updateServerUrl?(url: string): void;
}

export interface BibliographyPanelProps {
	className?: string;
	onItemSelect?: (item: any) => void;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	pluginInstance?: BibliographyPlugin;
	onFiltersChange?: (filters: Record<string, any>) => void;
}

// Language Server Protocol (LSP) Support
export interface LSPPluginTransportConfig {
	type: 'websocket' | 'worker';
	url?: string;
	workerPath?: string;
}

export interface LSPPlugin extends Plugin {
	type: 'lsp';
	icon?: React.ComponentType;
	isEnabled(): boolean;
	getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error';
	getStatusMessage(): string;
	getSupportedFileTypes(): string[];
	getSupportedLanguages(): string[];
	getTransportConfig(): LSPPluginTransportConfig;
	updateServerUrl?(url: string): void;

	renderPanel?: React.ComponentType<LSPPanelProps>;
}

export interface LSPPanelProps {
	className?: string;
	onItemSelect?: (item: any) => void;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	pluginInstance?: LSPPlugin;
}

// Backup and Restore
export interface BackupPlugin extends Plugin {
	type: 'backup';
	icon: React.ComponentType;
	canHandle: (backupType: string) => boolean;
	renderStatusIndicator: React.ComponentType<BackupStatusIndicatorProps>;
	renderModal: React.ComponentType<BackupModalProps>;
	getService: () => BackupServiceInterface;
	gitRemote?: GitRemoteProvider;
}

export interface BackupStatusIndicatorProps {
	className?: string;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

export interface BackupModalProps {
	isOpen: boolean;
	onClose: () => void;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

export interface BackupServiceInterface {
	getStatus(): BackupStatus;
	requestAccess(): Promise<{ success: boolean; error?: string }>;
	disconnect(): Promise<void>;
	synchronize(projectId?: string): Promise<void>;
	exportData(projectId?: string): Promise<void>;
	importChanges(projectId?: string): Promise<void>;
	addStatusListener(callback: (status: BackupStatus) => void): () => void;
}

// Theme Layout Configuration
export type ThemeView = 'explorer' | 'editor' | 'output' | 'chat';

export interface ThemeOutlineControls {
	preview?: boolean;
	maximize?: boolean;
	returnToEditorOnNavigate?: boolean;
}

export interface ThemeLayout {
	id: string;
	name: string;
	containerClass: string;
	defaultFileExplorerWidth: number;
	minFileExplorerWidth: number;
	maxFileExplorerWidth: number;
	stylesheetPath: string;
	outlineControls?: ThemeOutlineControls;
}

// Themes
export interface ThemePlugin extends Plugin {
	type: 'theme';
	themes: ThemeVariant[];
	applyTheme: (variant: string) => void;
	getThemeVariants: () => ThemeVariant[];
	getCurrentTheme: () => ThemeVariant;
	getLayout: () => ThemeLayout;
	applyLayout: () => void;
	requestView?: (view: ThemeView) => void;
	cleanup?: () => void;
}

export interface ThemeVariant {
	id: string;
	name: string;
	isDark: boolean;
}

// Registry that will hold all the plugins
export type PluginRegistry = {
	viewers: ViewerPlugin[];
	collaborativeViewers: CollaborativeViewerPlugin[];
	renderers: RendererPlugin[];
	loggers: LoggerPlugin[];
	lsp: LSPPlugin[];
	bibliography: BibliographyPlugin[];
	backup: BackupPlugin[];
	themes: ThemePlugin[];
};
