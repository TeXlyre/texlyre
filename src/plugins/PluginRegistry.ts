// src/plugins/PluginRegistry.ts
import { createNamedLogger } from '@/logging';
import plugins from './index';
import type { Setting } from '../contexts/SettingsContext';
import type { GitRemoteProvider } from '../types/gitRemote';
import type {
	BackupPlugin,
	CollaborativeViewerPlugin,
	LoggerPlugin,
	BibliographyPlugin,
	LSPPlugin,
	Plugin,
	PluginRegistry,
	RendererPlugin,
	ThemePlugin,
	ViewerPlugin,
} from './PluginInterface';

const moduleLog = createNamedLogger('PluginRegistry');

export const pluginSettings: Setting[] = [];

class PluginRegistryManager {
	private registry: PluginRegistry = {
		viewers: [],
		collaborativeViewers: [],
		renderers: [],
		loggers: [],
		lsp: [],
		bibliography: [],
		backup: [],
		themes: [],
	};

	constructor() {
		this.loadPlugins();
	}

	private loadPlugins() {
		try {
			const groups = [
				['viewers', plugins.viewers],
				['collaborative viewers', plugins.collaborative_viewers],
				['renderers', plugins.renderers],
				['loggers', plugins.loggers],
				['bibliography plugins', plugins.bibliography],
				['LSP plugins', plugins.lsp],
				['backup plugins', plugins.backup],
				['themes', plugins.themes],
			] as const;

			for (const [label, group] of groups) {
				const loaded = Object.values(group ?? {}) as Plugin[];
				if (loaded.length === 0) continue;
				moduleLog.info(`Loading ${label}:`, Object.keys(group ?? {}));
				for (const plugin of loaded) {
					this.registerPlugin(plugin);
					if (plugin.settings) pluginSettings.push(...plugin.settings);
				}
			}
		} catch (error) {
			moduleLog.error('Failed to load plugins:', error);
		}
	}

	refreshPluginSettings(): Setting[] {
		return (Object.values(this.registry) as Plugin[][]).flatMap((group) =>
			group.flatMap((plugin) => plugin.settings ?? []),
		);
	}

	registerPlugin(plugin: Plugin) {
		moduleLog.info('Registering plugin:', plugin.name, 'of type:', plugin.type);

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
			case 'bibliography':
				this.registry.bibliography.push(plugin as BibliographyPlugin);
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
				moduleLog.warn(`Unsupported plugin type: ${plugin.type}`);
		}
	}

	getViewers(): ViewerPlugin[] {
		return this.registry.viewers;
	}

	getViewerForFile(fileName: string, mimeType?: string): ViewerPlugin | null {
		for (const viewer of this.registry.viewers) {
			if (viewer.canHandle(fileName, mimeType)) return viewer;
		}
		return null;
	}

	getEditableViewersWithExtensions(): ViewerPlugin[] {
		return this.registry.viewers.filter(
			(v) => v.isEditable && v.getSupportedExtensions,
		);
	}

	getCollaborativeViewers(): CollaborativeViewerPlugin[] {
		return this.registry.collaborativeViewers;
	}

	getCollaborativeViewerForFile(
		fileName: string,
		mimeType?: string,
	): CollaborativeViewerPlugin | null {
		for (const viewer of this.registry.collaborativeViewers) {
			if (viewer.canHandle(fileName, mimeType)) return viewer;
		}
		return null;
	}

	getRenderers(): RendererPlugin[] {
		return this.registry.renderers;
	}

	getRendererIfAvailable(
		outputType: string,
		rendererPluginIds: string[],
		getSetting: (id: string) => { value?: unknown } | undefined,
	): RendererPlugin | null {
		for (const rendererId of rendererPluginIds) {
			const renderer = this.getRendererForOutput(outputType, rendererId);
			if (!renderer) continue;

			const enableSetting = getSetting(`${renderer.id}-enable`);
			if (enableSetting !== undefined && enableSetting.value === false) continue;

			return renderer;
		}
		return null;
	}

	getRendererForOutput(
		outputType: string,
		preferredRenderer?: string,
	): RendererPlugin | null {
		const availableRenderers = this.registry.renderers.filter((renderer) =>
			renderer.canHandle(outputType),
		);

		if (availableRenderers.length === 0) return null;

		if (preferredRenderer) {
			const preferred = availableRenderers.find(
				(renderer) => renderer.id === preferredRenderer,
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
			if (logger.canHandle(logType)) return logger;
		}
		return null;
	}

	getBibliographyPlugins(): BibliographyPlugin[] {
		return this.registry.bibliography;
	}

	getBibliographyPlugin(id: string): BibliographyPlugin | null {
		return this.registry.bibliography.find((plugin) => plugin.id === id) || null;
	}

	getAllBibliographyPlugins(): BibliographyPlugin[] {
		return [...this.registry.bibliography];
	}

	getLSPPlugins(): LSPPlugin[] {
		return this.registry.lsp;
	}

	getLSPPlugin(id: string): LSPPlugin | null {
		return this.registry.lsp.find((plugin) => plugin.id === id) || null;
	}

	getEnabledLSPPlugins(): LSPPlugin[] {
		return this.registry.lsp.filter((plugin) => plugin.isEnabled());
	}

	getAllLSPPlugins(): LSPPlugin[] {
		return [...this.registry.lsp];
	}

	getLSPPluginsForFileType(fileType: string): LSPPlugin[] {
		return this.registry.lsp.filter(
			(plugin) =>
				plugin.isEnabled() && plugin.getSupportedFileTypes().includes(fileType),
		);
	}

	getBackup(): BackupPlugin[] {
		return this.registry.backup;
	}

	getGitRemoteProviders(): GitRemoteProvider[] {
		return this.registry.backup.flatMap((plugin) =>
			plugin.gitRemote ? [plugin.gitRemote] : [],
		);
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
