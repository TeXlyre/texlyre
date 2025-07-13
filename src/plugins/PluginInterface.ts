// src/plugins/PluginInterface.ts
import type React from "react";
import type { Setting } from "../contexts/SettingsContext";
import type { BackupStatus } from "../types/backup";

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
	backup: BackupPlugin[];
	themes: ThemePlugin[];
};
