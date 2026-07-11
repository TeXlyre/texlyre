// src/utils/editorNavigator.ts
export type EditorTarget =
	| { kind: 'file'; fileId: string }
	| { kind: 'document'; documentId: string };

interface GotoOptions {
	line?: number;
	position?: number;
	column?: number;
	tabId?: string;
}

function dispatchGoto(target: EditorTarget | null, opts: GotoOptions): void {
	const detail = {
		...opts,
		fileId: target?.kind === 'file' ? target.fileId : undefined,
		documentId: target?.kind === 'document' ? target.documentId : undefined,
	};

	const eventName =
		opts.position !== undefined
			? 'codemirror-goto-char'
			: 'codemirror-goto-line';

	document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function gotoEditor(
	target: EditorTarget | null,
	opts: GotoOptions,
	options?: { waitForReady?: boolean; timeoutMs?: number },
): void {
	if (!options?.waitForReady || !target) {
		dispatchGoto(target, opts);
		return;
	}

	const matches = (detail: {
		fileId?: string;
		documentId?: string;
		isEditingFile: boolean;
	}) =>
		target.kind === 'file'
			? detail.isEditingFile && detail.fileId === target.fileId
			: !detail.isEditingFile && detail.documentId === target.documentId;

	const handler = (e: Event) => {
		if (!matches((e as CustomEvent).detail)) return;
		cleanup();
		dispatchGoto(target, opts);
	};

	const fallback = setTimeout(() => {
		cleanup();
		dispatchGoto(target, opts);
	}, options.timeoutMs ?? 3000);

	const cleanup = () => {
		document.removeEventListener('editor-ready', handler);
		clearTimeout(fallback);
	};

	document.addEventListener('editor-ready', handler);
}

export function clickWhenReady(
	selectors: string[],
	options?: { timeoutMs?: number; intervalMs?: number },
): Promise<boolean> {
	const timeoutMs = options?.timeoutMs ?? 30000;
	const intervalMs = options?.intervalMs ?? 100;
	const deadline = Date.now() + timeoutMs;

	const tryClick = (): boolean => {
		for (const selector of selectors) {
			const element = document.querySelector(
				selector,
			) as HTMLButtonElement | null;
			if (element && !element.disabled) {
				element.click();
				return true;
			}
		}
		return false;
	};

	return new Promise((resolve) => {
		if (tryClick()) {
			resolve(true);
			return;
		}

		const interval = setInterval(() => {
			if (tryClick()) {
				clearInterval(interval);
				resolve(true);
			} else if (Date.now() >= deadline) {
				clearInterval(interval);
				resolve(false);
			}
		}, intervalMs);
	});
}
