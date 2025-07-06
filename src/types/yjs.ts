// src/types/yjs.ts
export type YjsDocUrl = string;

export interface UrlFragments {
	yjsUrl: string;
	docId?: string;
	filePath?: string;
}

export const isValidYjsUrl = (url: string): boolean => {
	return url.startsWith("yjs:");
};

export const parseUrlFragments = (url: string): UrlFragments => {
	const parts = url.split("&");
	const result: UrlFragments = { yjsUrl: "" };

	for (const part of parts) {
		if (part.startsWith("yjs:")) {
			result.yjsUrl = part; // leave as-is or optionally decode
		} else if (part.startsWith("doc:")) {
			result.docId = decodeURIComponent(part.slice(4));
		} else if (part.startsWith("file:")) {
			result.filePath = decodeURIComponent(part.slice(5));
		}
	}

	return result;
};

export const buildUrlWithFragments = (
	yjsUrl: string,
	docId?: string,
	filePath?: string,
): string => {
	let url = yjsUrl;

	if (docId) {
		url += `&doc:${encodeURIComponent(docId)}`;
	}

	if (filePath) {
		url += `&file:${encodeURIComponent(filePath)}`;
	}

	return url;
};
