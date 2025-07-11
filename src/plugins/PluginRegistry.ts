// src/plugins/PluginRegistry.ts
import * as plugins from "../../extras";
import type { Setting } from "../contexts/SettingsContext";
import type {
	BackupPlugin,
	CollaborativeViewerPlugin,
	LoggerPlugin,
	Plugin,
	PluginRegistry,
	RendererPlugin,
	ThemePlugin,
	ViewerPlugin,
} from "./PluginInterface";

export const pluginSettings: Setting[] = [];

class PluginRegistryManager {
	private registry: PluginRegistry = {
		viewers: [],
		collaborativeViewers: [],
		renderers: [],
		loggers: [],
		backup: [],
		themes: [],
	};

	constructor() {
		this.loadPlugins();
	}

	private loadPlugins() {
		try {
			// Register regular viewers
			if (plugins.viewers) {
				console.log("[PluginRegistry] Loading viewers:", Object.keys(plugins.viewers));
				Object.values(plugins.viewers).forEach((plugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			// Register collaborative viewers
			if (plugins.collaborative_viewers) {
				console.log(
					"[PluginRegistry] Loading collaborative viewers:",
					Object.keys(plugins.collaborative_viewers),
				);
				Object.values(plugins.collaborative_viewers).forEach((plugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			// Register renderer plugins
			if (plugins.renderers) {
				console.log("[PluginRegistry] Loading renderers:", Object.keys(plugins.renderers));
				Object.values(plugins.renderers).forEach((plugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			// Register logger plugins
			if (plugins.loggers) {
				console.log("[PluginRegistry] Loading loggers:", Object.keys(plugins.loggers));
				Object.values(plugins.loggers).forEach((plugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			// Register backup plugins
			if (plugins.backup) {
				console.log("[PluginRegistry] Loading backup plugins:", Object.keys(plugins.backup));
				Object.values(plugins.backup).forEach((plugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}

			// Register theme plugins
			if (plugins.themes) {
				console.log("[PluginRegistry] Loading themes:", Object.keys(plugins.themes));
				Object.values(plugins.themes).forEach((plugin) => {
					this.registerPlugin(plugin);
					if (plugin.settings && Array.isArray(plugin.settings)) {
						pluginSettings.push(...plugin.settings);
					}
				});
			}
		} catch (error) {
			console.error("Failed to load plugins:", error);
		}
	}

	registerPlugin(plugin: Plugin) {
		console.log("[PluginRegistry] Registering plugin:", plugin.name, "of type:", plugin.type);

		switch (plugin.type) {
			case "viewer":
				this.registry.viewers.push(plugin as ViewerPlugin);
				break;
			case "collaborative-viewer":
				this.registry.collaborativeViewers.push(
					plugin as CollaborativeViewerPlugin,
				);
				break;
			case "renderer":
				this.registry.renderers.push(plugin as RendererPlugin);
				break;
			case "logger":
				this.registry.loggers.push(plugin as LoggerPlugin);
				break;
			case "backup":
				this.registry.backup.push(plugin as BackupPlugin);
				break;
			case "theme":
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
		console.log("[PluginRegistry] Looking for collaborative viewer for:", fileName, mimeType);
		console.log(
			"Available collaborative viewers:",
			this.registry.collaborativeViewers.map((v) => v.name),
		);

		for (const viewer of this.registry.collaborativeViewers) {
			console.log(
				"Checking collaborative viewer:",
				viewer.name,
				"canHandle result:",
				viewer.canHandle(fileName, mimeType),
			);
			if (viewer.canHandle(fileName, mimeType)) {
				console.log("Found matching collaborative viewer:", viewer.name);
				return viewer;
			}
		}
		console.log("No collaborative viewer found for:", fileName, mimeType);
		return null;
	}

	getRenderers(): RendererPlugin[] {
		return this.registry.renderers;
	}

	getRendererForOutput(outputType: string): RendererPlugin | null {
		for (const renderer of this.registry.renderers) {
			if (renderer.canHandle(outputType)) {
				return renderer;
			}
		}
		return null;
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
