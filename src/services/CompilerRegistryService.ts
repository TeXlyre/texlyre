// src/services/CompilerRegistryService.ts
import type { CompilerProvider } from '../types/compilation';

type RegistryListener = () => void;

class CompilerRegistryService {
	private providers: Map<string, CompilerProvider> = new Map();
	private listeners: Set<RegistryListener> = new Set();
	private version = 0;

	register(provider: CompilerProvider): void {
		this.providers.set(provider.id, provider);
		this.notify();
	}

	unregister(providerId: string): void {
		if (this.providers.delete(providerId)) {
			this.notify();
		}
	}

	get(providerId: string): CompilerProvider | undefined {
		return this.providers.get(providerId);
	}

	list(): CompilerProvider[] {
		return Array.from(this.providers.values());
	}

	getForProjectType(projectType: string): CompilerProvider | undefined {
		return this.list().find((provider) => provider.projectType === projectType);
	}

	getForExtension(extension: string): CompilerProvider | undefined {
		const normalized = extension.replace(/^\./, '').toLowerCase();
		return this.list().find((provider) =>
			provider.inputExtensions.includes(normalized),
		);
	}

	getVersion(): number {
		return this.version;
	}

	onChange(listener: RegistryListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.version++;
		this.listeners.forEach((listener) => {
			try {
				listener();
			} catch (error) {
				console.error('[CompilerRegistryService] Listener error:', error);
			}
		});
	}
}

export const compilerRegistryService = new CompilerRegistryService();
