// src/services/registerBuiltinCompilers.ts
import { compilerRegistryService } from './CompilerRegistryService';

let registered = false;

export function registerBuiltinCompilers(): void {
	if (registered) return;
	registered = true;

	compilerRegistryService.register({
		id: 'internal:latex',
		label: 'LaTeX',
		source: 'builtin',
		projectType: 'latex',
		inputExtensions: ['tex', 'latex'],
		outputFormats: [{ id: 'pdf', mimeType: 'application/pdf' }],
		capabilities: { outline: true, formatter: 'tex-fmt' },
	});

	compilerRegistryService.register({
		id: 'internal:typst',
		label: 'Typst',
		source: 'builtin',
		projectType: 'typst',
		inputExtensions: ['typ', 'typst'],
		outputFormats: [
			{ id: 'pdf', mimeType: 'application/pdf' },
			{ id: 'svg', mimeType: 'image/svg+xml' },
		],
		capabilities: { outline: true },
	});
}
