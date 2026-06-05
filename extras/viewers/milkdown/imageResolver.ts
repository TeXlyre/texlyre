// extras/viewers/milkdown/imageResolver.ts
import { $view } from '@milkdown/kit/utils';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import type { Node } from '@milkdown/kit/prose/model';
import type { NodeView } from '@milkdown/kit/prose/view';

import { fileStorageService } from '@/services/FileStorageService';

const isExternal = (src: string): boolean =>
	/^(https?:|data:|blob:)/i.test(src);

const resolvePath = (currentFilePath: string, src: string): string => {
	if (src.startsWith('/')) return src;
	const dir = currentFilePath.slice(0, currentFilePath.lastIndexOf('/') + 1);
	const parts: string[] = [];
	for (const segment of `${dir}${src}`.split('/')) {
		if (segment === '.' || segment === '') continue;
		if (segment === '..') parts.pop();
		else parts.push(segment);
	}
	return `/${parts.join('/')}`;
};

const fetchBlobUrl = async (
	currentFilePath: string,
	src: string,
): Promise<string | null> => {
	const target = resolvePath(currentFilePath, src);
	const file = await fileStorageService.getFileByPath(target);
	if (!file || file.type !== 'file' || !file.content) return null;
	const bytes =
		file.content instanceof ArrayBuffer
			? file.content
			: new TextEncoder().encode(file.content as string).buffer;
	const blob = new Blob([bytes], { type: file.mimeType || 'image/png' });
	return URL.createObjectURL(blob);
};

class ResolvedImageView implements NodeView {
	dom: HTMLImageElement;
	private currentSrc = '';

	constructor(
		node: Node,
		private getCurrentFilePath: () => string,
		private cache: Map<string, Promise<string | null>>,
	) {
		this.dom = document.createElement('img');
		this.dom.decoding = 'async';
		this.dom.loading = 'lazy';
		this.applyAttrs(node);
	}

	private applyAttrs(node: Node): void {
		const src = (node.attrs.src as string) || '';
		const alt = (node.attrs.alt as string) || '';
		const title = (node.attrs.title as string) || '';
		this.dom.alt = alt;
		if (title) this.dom.title = title;

		if (src === this.currentSrc) return;
		this.currentSrc = src;

		if (!src || isExternal(src)) {
			this.dom.src = src;
			return;
		}

		const key = resolvePath(this.getCurrentFilePath(), src);
		let pending = this.cache.get(key);
		if (!pending) {
			pending = fetchBlobUrl(this.getCurrentFilePath(), src);
			this.cache.set(key, pending);
		}

		pending.then((url) => {
			if (this.currentSrc === src) this.dom.src = url || '';
		});
	}

	update(node: Node): boolean {
		if (node.type.name !== 'image') return false;
		this.applyAttrs(node);
		return true;
	}

	ignoreMutation(): boolean {
		return true;
	}

	stopEvent(): boolean {
		return false;
	}
}

export function createImageResolver(getCurrentFilePath: () => string) {
	const cache = new Map<string, Promise<string | null>>();

	const plugin = $view(imageSchema.node, () => (node) => {
		return new ResolvedImageView(node, getCurrentFilePath, cache);
	});

	const dispose = () => {
		for (const pending of cache.values()) {
			pending.then((url) => {
				if (url) URL.revokeObjectURL(url);
			});
		}
		cache.clear();
	};

	return { plugin, dispose };
}
