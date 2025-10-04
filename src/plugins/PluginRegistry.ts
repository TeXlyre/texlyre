// src/plugins/PluginRegistry.ts
import plugins from './index';
import type { Setting } from '../contexts/SettingsContext';
import type {
	BackupPlugin,
	CollaborativeViewerPlugin,
	LoggerPlugin,
	LSPPlugin,
	Plugin,
	PluginRegistry,
	RendererPlugin,
	ThemePlugin,
	ViewerPlugin,
} from './PluginInterface';

export const pluginSettings: Setting[] = [];

class PluginRegistryManager {
	private registry: PluginRegistry = {
		viewers: [],
		collaborativeViewers: [],
		renderers: [],
		loggers: [],
		lsp: [],
		backup: [],
		themes: [],
	};

	constructor() {
		this.loadPlugins();
	}

	private loadPlugins() {
		try {
			if (plugins.viewers && Object.keys(plugins.viewers).length > 0) {
				console.log('[PluginRegistry] Loading viewers:', Object.keys(plugins.viewers));
				Object.values(plugins.viewers).forEach((plugin: ViewerPlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			if (plugins.collaborative_viewers && Object.keys(plugins.collaborative_viewers).length > 0) {
				console.log(
					'[PluginRegistry] Loading collaborative viewers:',
					Object.keys(plugins.collaborative_viewers),
				);
				Object.values(plugins.collaborative_viewers).forEach((plugin: CollaborativeViewerPlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			if (plugins.renderers && Object.keys(plugins.renderers).length > 0) {
				console.log('[PluginRegistry] Loading renderers:', Object.keys(plugins.renderers));
				Object.values(plugins.renderers).forEach((plugin: RendererPlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			if (plugins.loggers && Object.keys(plugins.loggers).length > 0) {
				console.log('[PluginRegistry] Loading loggers:', Object.keys(plugins.loggers));
				Object.values(plugins.loggers).forEach((plugin: LoggerPlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			if (plugins.lsp && Object.keys(plugins.lsp).length > 0) {
				console.log('[PluginRegistry] Loading LSP plugins:', Object.keys(plugins.lsp));
				Object.values(plugins.lsp).forEach((plugin: LSPPlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			if (plugins.backup && Object.keys(plugins.backup).length > 0) {
				console.log('[PluginRegistry] Loading backup plugins:', Object.keys(plugins.backup));
				Object.values(plugins.backup).forEach((plugin: BackupPlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			if (plugins.themes && Object.keys(plugins.themes).length > 0) {
				console.log('[PluginRegistry] Loading themes:', Object.keys(plugins.themes));
				Object.values(plugins.themes).forEach((plugin: ThemePlugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}
		} catch (error) {
			console.error('Failed to load plugins:', error);
		}
	}

	registerPlugin(plugin: Plugin) {
		console.log('[PluginRegistry] Registering plugin:', plugin.name, 'of type:', plugin.type);

		switch (plugin.type) {
			case 'viewer':
				this.registry.viewers.push(plugin as ViewerPlugin);
				break;
			case 'collaborative-viewer':
				this.registry.collaborativeViewers.push(
					plugin as CollaborativeViewerPlugin,
				);
				break;
			case 'renderer':
				this.registry.renderers.push(plugin as RendererPlugin);
				break;
			case 'logger':
				this.registry.loggers.push(plugin as LoggerPlugin);
				break;
			case 'lsp':
				this.registry.lsp.push(plugin as LSPPlugin);
				break;
			case 'backup':
				this.registry.backup.push(plugin as BackupPlugin);
				break;
			case 'theme':
				this.registry.themes.push(plugin as ThemePlugin);
				break;
			default:
				console.warn(`Unsupported plugin type: ${plugin.type}`);
		}
	}

	getViewers(): ViewerPlugin[] {
		return this.registry.viewers;
	}

	getViewerForFile(fileName: string, mimeType?: string): ViewerPlugin | null {
		for (const viewer of this.registry.viewers) {
			if (viewer.canHandle(fileName, mimeType)) {
				return viewer;
			}
		}
		return null;
	}

	getCollaborativeViewers(): CollaborativeViewerPlugin[] {
		return this.registry.collaborativeViewers;
	}

	getCollaborativeViewerForFile(
		fileName: string,
		mimeType?: string,
	): CollaborativeViewerPlugin | null {
		console.log('[PluginRegistry] Looking for collaborative viewer for:', fileName, mimeType);
		console.log(
			'[PluginRegistry] Available collaborative viewers:',
			this.registry.collaborativeViewers.map((v) => v.name),
		);

		for (const viewer of this.registry.collaborativeViewers) {
			console.log(
				'[PluginRegistry] Checking collaborative viewer:',
				viewer.name,
				'canHandle result:',
				viewer.canHandle(fileName, mimeType),
			);
			if (viewer.canHandle(fileName, mimeType)) {
				console.log('[PluginRegistry] Found matching collaborative viewer:', viewer.name);
				return viewer;
			}
		}
		console.log('[PluginRegistry] No collaborative viewer found for:', fileName, mimeType);
		return null;
	}

	getRenderers(): RendererPlugin[] {
		return this.registry.renderers;
	}

	getRendererForOutput(outputType: string, preferredRenderer?: string): RendererPlugin | null {
		const availableRenderers = this.registry.renderers.filter(renderer =>
			renderer.canHandle(outputType)
		);

		if (availableRenderers.length === 0) return null;

		if (preferredRenderer) {
			const preferred = availableRenderers.find(renderer =>
				renderer.id === preferredRenderer
			);
			if (preferred) return preferred;
		}

		return availableRenderers[0];
	}

	getLoggers(): LoggerPlugin[] {
		return this.registry.loggers;
	}

	getLoggerForType(logType: string): LoggerPlugin | null {
		for (const logger of this.registry.loggers) {
			if (logger.canHandle(logType)) {
				return logger;
			}
		}
		return null;
	}

	getLSPPlugins(): LSPPlugin[] {
		return this.registry.lsp;
	}

	getLSPPlugin(id: string): LSPPlugin | null {
		return this.registry.lsp.find(plugin => plugin.id === id) || null;
	}

	getEnabledLSPPlugins(): LSPPlugin[] {
		return this.registry.lsp.filter(plugin => plugin.isEnabled());
	}

	getAllLSPPlugins(): LSPPlugin[] {
		return [...this.registry.lsp];
	}

	getLSPPluginsForFileType(fileType: string): LSPPlugin[] {
		return this.registry.lsp.filter(plugin =>
			plugin.isEnabled() && plugin.getSupportedFileTypes().includes(fileType)
		);
	}

	getBackup(): BackupPlugin[] {
		return this.registry.backup;
	}

	getBackupById(id: string): BackupPlugin | null {
		return this.registry.backup.find((plugin) => plugin.id === id) || null;
	}

	getThemes(): ThemePlugin[] {
		return this.registry.themes;
	}

	getThemeById(id: string): ThemePlugin | null {
		return this.registry.themes.find((theme) => theme.id === id) || null;
	}
}

export const pluginRegistry = new PluginRegistryManager();