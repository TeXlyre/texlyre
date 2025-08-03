// src/plugins/PluginInterface.ts
import type React from "react";
import type { Setting } from "../contexts/SettingsContext";
import type { BackupStatus } from "../types/backup";
import type { LSPRequest, LSPResponse, LSPNotification, LSPServerConfig } from "../types/lsp";

export interface Plugin {
	id: string;
	name: string;
	version: string;
	type: string;
	settings?: Setting[];
}

// Viewers
export interface ViewerPlugin extends Plugin {
	type: "viewer";
	icon?: React.ComponentType;
	canHandle: (fileType: string, mimeType?: string) => boolean;
	renderViewer: React.ComponentType<ViewerProps>;
}

export interface ViewerProps {
	fileId: string;
	content: ArrayBuffer;
	mimeType?: string;
	fileName: string;
}

export interface CollaborativeViewerPlugin extends Plugin {
	type: "collaborative-viewer";
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
	type: "renderer";
	canHandle: (outputType: string) => boolean;
	renderOutput: React.ComponentType<RendererProps>;
}

export interface RendererProps {
	content: ArrayBuffer;
	mimeType?: string;
	fileName?: string;
	onSave?: (fileName: string) => void;
	onDownload?: (fileName: string) => void;
}

// Loggers
export interface LoggerPlugin extends Plugin {
	type: "logger";
	canHandle: (logType: string) => boolean;
	renderVisualizer: React.ComponentType<LoggerProps>;
}

export interface LoggerProps {
	log: string;
	onLineClick?: (line: number) => void;
}

// Language Server Protocol (LSP) Support
export interface LSPPlugin extends Plugin {
    type: "lsp";
    icon?: React.ComponentType;

    // Core LSP functionality
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    isEnabled(): boolean;
    sendRequest(request: LSPRequest): Promise<LSPResponse>;
    onNotification(notification: LSPNotification): void;

    // Server configuration
    getServerConfig?(): LSPServerConfig | Promise<LSPServerConfig>;

    // UI Components
    renderPanel?: React.ComponentType<LSPPanelProps>;

    // Plugin-specific configuration
    getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error';
    getStatusMessage(): string;

    // File type support
    getSupportedFileTypes(): string[];
    getSupportedLanguages(): string[];

    setLSPRequestHandler?(handler: (request: LSPRequest) => Promise<LSPResponse>): void;
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
	type: "backup";
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
	fileExplorerPosition: "left" | "right";
	defaultFileExplorerWidth: number;
	minFileExplorerWidth: number;
	maxFileExplorerWidth: number;
	stylesheetPath: string;
}

// Themes
export interface ThemePlugin extends Plugin {
	type: "theme";
	themes: ThemeVariant[];
	applyTheme: (variant: string) => void;
	getThemeVariants: () => ThemeVariant[];
	getCurrentTheme: () => ThemeVariant;
	getLayout: () => ThemeLayout;
	applyLayout: () => void;
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
