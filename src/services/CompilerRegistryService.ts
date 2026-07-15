// src/services/CompilerRegistryService.ts
import type { CompilerInputFile, CompilerProvider } from '../types/compilation';

type RegistryListener = () => void;

class CompilerRegistryService {
	private providers: Map<string, CompilerProvider> = new Map();
	private listeners: Set<RegistryListener> = new Set();
	private version = 0;
	private builtinsRegistered = false;

	register(provider: CompilerProvider): void {
		this.providers.set(provider.id, provider);
		this.notify();
	}

	registerBuiltins(): void {
		if (this.builtinsRegistered) return;
		this.builtinsRegistered = true;

		this.register({
			id: 'internal:latex',
			label: 'LaTeX',
			source: 'builtin',
			projectType: 'latex',
			inputExtensions: ['tex', 'latex'],
			inputFiles: [
				{ extension: 'tex', label: 'LaTeX File', mimeType: 'text/x-tex' },
				{ extension: 'cls', label: 'LaTeX Class', mimeType: 'text/x-tex' },
				{ extension: 'sty', label: 'LaTeX Style', mimeType: 'text/x-tex' },
			],
			outputFormats: [{ id: 'pdf', mimeType: 'application/pdf' }],
			capabilities: { outline: true, formatter: 'tex-fmt' },
		});

		this.register({
			id: 'internal:typst',
			label: 'Typst',
			source: 'builtin',
			projectType: 'typst',
			inputExtensions: ['typ', 'typst'],
			inputFiles: [
				{ extension: 'typ', label: 'Typst File', mimeType: 'text/x-typst' },
			],
			outputFormats: [
				{ id: 'pdf', mimeType: 'application/pdf' },
				{ id: 'svg', mimeType: 'image/svg+xml' },
			],
			capabilities: { outline: true },
		});
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

	getInputFilesForProjectType(projectType: string): CompilerInputFile[] {
		const provider = this.getForProjectType(projectType);
		if (!provider) return [];
		if (provider.inputFiles?.length) return provider.inputFiles;
		return provider.inputExtensions.map((extension) => ({ extension }));
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
