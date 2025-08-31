// src/utils/urlUtils.ts
import {UrlFragments} from "../types/yjs.ts";

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
		} else if (part.startsWith("compile:")) {
			result.compile = decodeURIComponent(part.slice(8));
		}
	}

	return result;
};

export const buildUrlWithFragments = (
	yjsUrl: string,
	docId?: string,
	filePath?: string,
): string => {
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
};
