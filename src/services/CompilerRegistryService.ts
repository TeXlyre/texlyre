// src/services/CompilerRegistryService.ts
import { t } from '@/i18n';
import type { CompilerInputFile, CompilerProvider } from '../types/compilation';

type RegistryListener = () => void;

export interface CompilerProjectType {
	projectType: string;
	label: string;
}

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
			label: t('LaTeX'),
			source: 'builtin',
			projectType: 'latex',
			inputExtensions: ['tex', 'latex'],
			inputFiles: [
				{
					extension: 'tex',
					label: t('{typesetter} File', { typesetter: t('LaTeX') }),
					mimeType: 'text/x-tex',
				},
				{
					extension: 'cls',
					label: t('{typesetter} Class', { typesetter: t('LaTeX') }),
					mimeType: 'text/x-tex',
				},
				{
					extension: 'sty',
					label: t('{typesetter} Style', { typesetter: t('LaTeX') }),
					mimeType: 'text/x-tex',
				},
			],
			outputFormats: [{ id: 'pdf', mimeType: 'application/pdf' }],
			capabilities: { outline: true, formatter: 'tex-fmt' },
		});

		this.register({
			id: 'internal:typst',
			label: t('Typst'),
			source: 'builtin',
			projectType: 'typst',
			inputExtensions: ['typ', 'typst'],
			inputFiles: [
				{
					extension: 'typ',
					label: t('{typesetter} File', { typesetter: t('Typst') }),
					mimeType: 'text/x-typst',
				},
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

	listForProjectType(projectType: string): CompilerProvider[] {
		const providers = this.list().filter(
			(provider) => provider.projectType === projectType,
		);
		return [
			...providers.filter((provider) => provider.source === 'builtin'),
			...providers.filter((provider) => provider.source !== 'builtin'),
		];
	}

	listProjectTypes(): CompilerProjectType[] {
		const seen = new Set<string>();
		const projectTypes: CompilerProjectType[] = [];

		for (const provider of this.list()) {
			if (seen.has(provider.projectType)) continue;
			seen.add(provider.projectType);
			projectTypes.push({
				projectType: provider.projectType,
				label:
					this.getForProjectType(provider.projectType)?.label ?? provider.label,
			});
		}

		return projectTypes;
	}

	getForProjectType(projectType: string): CompilerProvider | undefined {
		return this.listForProjectType(projectType)[0];
	}

	resolve(
		projectType: string,
		compilerId?: string,
	): CompilerProvider | undefined {
		const selected = compilerId ? this.providers.get(compilerId) : undefined;
		if (selected?.projectType === projectType) return selected;
		return this.getForProjectType(projectType);
	}

	getForExtension(
		extension: string,
		projectType?: string,
	): CompilerProvider | undefined {
		const normalized = extension.replace(/^\./, '').toLowerCase();
		const matches = this.list().filter((provider) =>
			provider.inputExtensions.includes(normalized),
		);

		if (projectType) {
			const inProjectType = matches.find(
				(provider) => provider.projectType === projectType,
			);
			if (inProjectType) return inProjectType;
		}

		return matches[0];
	}

	getInputFilesForProjectType(projectType: string): CompilerInputFile[] {
		const merged = new Map<string, CompilerInputFile>();

		for (const provider of this.listForProjectType(projectType)) {
			const inputs = provider.inputFiles?.length
				? provider.inputFiles
				: provider.inputExtensions.map((extension) => ({ extension }));

			for (const input of inputs) {
				const key = input.extension.toLowerCase();
				if (!merged.has(key)) merged.set(key, input);
			}
		}

		return Array.from(merged.values());
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
