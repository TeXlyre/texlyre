// extras/renderers/pdf/latexInteraction/OcgAdapter.ts
import type {
	LatexPdfAdapterInstallResult,
	LatexPdfInteractionAdapter,
	LatexPdfInteractionContext,
} from './types';
import { addAnnotationMessage, flattenActionStrings } from './dom';

type OcgGroup = {
	id: string;
	name: string;
	visible: boolean;
};

type OptionalContentConfigLike = {
	getGroups?: () => Map<string, unknown> | Record<string, unknown> | null;
	isVisible?: (group: unknown) => boolean;
	setVisibility?: (id: string, visible: boolean) => void;
	[key: string]: unknown;
};

function readGroupName(group: unknown, fallback: string): string {
	if (!group || typeof group !== 'object') return fallback;

	const record = group as Record<string, unknown>;
	return typeof record.name === 'string' && record.name.trim()
		? record.name
		: fallback;
}

function getGroups(config: unknown): OcgGroup[] {
	if (!config || typeof config !== 'object') return [];

	const optionalContentConfig = config as OptionalContentConfigLike;
	const groups = optionalContentConfig.getGroups?.();
	const entries =
		groups instanceof Map
			? Array.from(groups.entries())
			: groups && typeof groups === 'object'
				? Object.entries(groups)
				: [];

	return entries
		.map(([id, group]) => ({
			id,
			name: readGroupName(group, id),
			visible: optionalContentConfig.isVisible?.(group) ?? true,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function renderLayerPanel(
	root: HTMLElement,
	context: LatexPdfInteractionContext,
	groups: OcgGroup[],
): () => void {
	const config = context.analysis
		.optionalContentConfig as OptionalContentConfigLike;
	const panel = document.createElement('div');
	panel.className = 'pdf-latex-ocg-panel';
	panel.setAttribute('role', 'group');
	panel.setAttribute('aria-label', 'PDF layers');

	const title = document.createElement('div');
	title.className = 'pdf-latex-ocg-title';
	title.textContent = 'PDF layers';
	panel.appendChild(title);

	const refreshViewer = () => {
		const pdfViewer = context.pdfViewer as {
			refresh?: () => void;
			update?: () => void;
			_pages?: Array<{ update?: (options?: unknown) => void }>;
		};

		if (typeof pdfViewer.refresh === 'function') {
			pdfViewer.refresh();
			return;
		}

		if (typeof pdfViewer.update === 'function') {
			pdfViewer.update();
			return;
		}

		for (const page of pdfViewer._pages || []) {
			page.update?.({ optionalContentConfigPromise: Promise.resolve(config) });
		}
	};

	for (const group of groups) {
		const label = document.createElement('label');
		label.className = 'pdf-latex-ocg-toggle';

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.checked = group.visible;
		input.addEventListener('change', () => {
			config.setVisibility?.(group.id, input.checked);
			refreshViewer();
		});

		const text = document.createElement('span');
		text.textContent = group.name;

		label.append(input, text);
		panel.appendChild(label);
	}

	root.appendChild(panel);

	return () => panel.remove();
}

export const OcgAdapter: LatexPdfInteractionAdapter = {
	name: 'ocg',
	detect: (context: LatexPdfInteractionContext) =>
		Boolean(context.analysis.optionalContentConfig) ||
		flattenActionStrings(context.analysis.documentActions).some((js) =>
			/ocg|optional content|layer/i.test(js),
		),
	install: (context): LatexPdfAdapterInstallResult => {
		const root = context.pdfViewer.viewer;
		if (!root) return { installed: false };

		const groups = getGroups(context.analysis.optionalContentConfig);
		const names = groups.map((group) => group.name);
		const message = names.length
			? `PDF layers detected: ${names.join(', ')}`
			: 'PDF optional content layers detected.';
		const disposers: Array<() => void> = [];

		root.classList.add('pdf-latex-ocg-enabled');
		disposers.push(
			addAnnotationMessage(root, message, 'pdf-latex-ocg-notice'),
			() => root.classList.remove('pdf-latex-ocg-enabled'),
		);

		if (
			groups.length > 0 &&
			typeof (
				context.analysis.optionalContentConfig as OptionalContentConfigLike
			).setVisibility === 'function'
		) {
			disposers.push(renderLayerPanel(root, context, groups));
		}

		return {
			installed: true,
			dispose: () => {
				for (const dispose of disposers) dispose();
			},
		};
	},
};
