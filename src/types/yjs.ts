// src/types/yjs.ts
export type YjsDocUrl = string;

export interface UrlFragments {
	yjsUrl: string;
	docId?: string;
	filePath?: string;
	compile?: string;
}
