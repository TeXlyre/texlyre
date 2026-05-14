// src/utils/urlUtils.ts
import { UrlFragments } from '../types/yjs.ts';

const LEGACY_YJS_PROJECT_ID_RE = /^[a-z0-9]{20,32}$/;
const UUID_PROJECT_ID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidYjsProjectId(projectId: string): boolean {
	const value = projectId.trim();

	return (
		LEGACY_YJS_PROJECT_ID_RE.test(value) ||
		UUID_PROJECT_ID_RE.test(value)
	);
}

export function isValidYjsUrl(url: string): boolean {
	const value = url.trim();

	if (!value.startsWith('yjs:')) return false;
	if (value.includes('&')) return false;

	return isValidYjsProjectId(value.slice(4));
}

export function parseUrlFragments(url: string): UrlFragments {
	const parts = url.split('&');
	const result: UrlFragments = { yjsUrl: '' };

	for (const part of parts) {
		if (part.startsWith('yjs:')) {
			const candidate = part.trim();
			result.yjsUrl = isValidYjsUrl(candidate) ? candidate : '';
		} else if (part.startsWith('doc:')) {
			result.docId = decodeURIComponent(part.slice(4));
		} else if (part.startsWith('file:')) {
			result.filePath = decodeURIComponent(part.slice(5));
		} else if (part.startsWith('compile:')) {
			result.compile = decodeURIComponent(part.slice(8));
		}
	}

	return result;
}

export function buildUrlWithFragments(
	yjsUrl: string,
	docId?: string,
	filePath?: string,
): string {
	const currentHash = window.location.hash.substring(1);
	const existingFragments = parseUrlFragments(currentHash);

	let url = yjsUrl;
	if (docId) {
		url += `&doc:${encodeURIComponent(docId)}`;
	}
	if (filePath) {
		url += `&file:${encodeURIComponent(filePath)}`;
	}
	if (existingFragments.compile) {
		url += `&compile:${encodeURIComponent(existingFragments.compile)}`;
	}

	return url;
}

export function pushHash(hash: string): void {
	const target = hash ? `#${hash}` : `${window.location.pathname}${window.location.search}`;
	const oldURL = window.location.href;
	window.history.pushState(null, '', target);
	if (window.location.href !== oldURL) {
		window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
	}
}

export function replaceHash(hash: string): void {
	const target = hash ? `#${hash}` : `${window.location.pathname}${window.location.search}`;
	const oldURL = window.location.href;
	window.history.replaceState(null, '', target);
	if (window.location.href !== oldURL) {
		window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
	}
}
