// src/plugins/PluginInterface.ts
import type React from 'react';
import type { Setting } from '../contexts/SettingsContext';
import type { BackupStatus } from '../types/backup';

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
}

export interface RendererProps {
	content: ArrayBuffer | Uint8Array | string;
	mimeType?: string;
	fileName?: string;
	onSave?: (fileName: string) => void;
	onDownload?: (fileName: string) => void;
	controllerRef?: (controller: RendererController | null) => void;
}

// Loggers
export interface LoggerPlugin extends Plugin {
	type: 'logger';
	canHandle: (logType: string) => boolean;
	renderVisualizer: React.ComponentType<LoggerProps>;
}

export interface LoggerProps {
	log: string;
	onLineClick?: (line: number) => void;
}

// Language Server Protocol (LSP) Support
export interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
}

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

	getBibliographyEntries?(): Promise<BibEntry[]>;

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
export interface ThemeLayout {
	id: string;
	name: string;
	containerClass: string;
	defaultFileExplorerWidth: number;
	minFileExplorerWidth: number;
	maxFileExplorerWidth: number;
	stylesheetPath: string;
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
	backup: BackupPlugin[];
	themes: ThemePlugin[];
};