// extras/viewers/bibtex/tidyOptions.ts
export interface TidyOptions {
	omit?: string[];
	curly?: boolean;
	numeric?: boolean;
	months?: boolean;
	space?: number | boolean;
	tab?: boolean;
	align?: number | boolean;
	blankLines?: boolean;
	sort?: string[] | boolean;
	duplicates?: ('doi' | 'key' | 'abstract' | 'citation')[] | boolean;
	merge?: 'first' | 'last' | 'combine' | 'overwrite' | boolean;
	stripEnclosingBraces?: boolean;
	dropAllCaps?: boolean;
	escape?: boolean;
	sortFields?: string[] | boolean;
	stripComments?: boolean;
	trailingCommas?: boolean;
	encodeUrls?: boolean;
	tidyComments?: boolean;
	removeEmptyFields?: boolean;
	removeDuplicateFields?: boolean;
	generateKeys?: string | boolean;
	maxAuthors?: number;
	lowercase?: boolean;
	enclosingBraces?: string[] | boolean;
	removeBraces?: string[] | boolean;
	wrap?: number | boolean;
	lookupDois?: boolean;
}

export const getPresetOptions = (preset: string): TidyOptions => {
	switch (preset) {
		case 'minimal':
			return {
				omit: [],
				curly: false,
				numeric: false,
				months: false,
				space: 2,
				tab: false,
				align: false,
				blankLines: false,
				sort: false,
				duplicates: false,
				merge: false,
				stripEnclosingBraces: false,
				dropAllCaps: false,
				escape: true,
				sortFields: false,
				stripComments: false,
				trailingCommas: false,
				encodeUrls: false,
				tidyComments: true,
				removeEmptyFields: false,
				removeDuplicateFields: true,
				generateKeys: false,
				maxAuthors: undefined,
				lowercase: true,
				enclosingBraces: false,
				removeBraces: false,
				wrap: false,
				lookupDois: false,
			};
		case 'strict':
			return {
				omit: [],
				curly: true,
				numeric: true,
				months: true,
				space: 2,
				tab: false,
				align: 14,
				blankLines: true,
				sort: ['key'],
				duplicates: ['doi', 'citation', 'abstract'],
				merge: 'combine',
				stripEnclosingBraces: true,
				dropAllCaps: true,
				escape: true,
				sortFields: true,
				stripComments: true,
				trailingCommas: false,
				encodeUrls: true,
				tidyComments: true,
				removeEmptyFields: true,
				removeDuplicateFields: true,
				generateKeys: false,
				maxAuthors: undefined,
				lowercase: true,
				enclosingBraces: ['title'],
				removeBraces: false,
				wrap: 80,
				lookupDois: false,
			};
		default: // 'standard'
			return {
				omit: [],
				curly: false,
				numeric: false,
				months: false,
				space: 2,
				tab: false,
				align: 14,
				blankLines: false,
				sort: false,
				duplicates: false,
				merge: false,
				stripEnclosingBraces: false,
				dropAllCaps: false,
				escape: true,
				sortFields: false,
				stripComments: false,
				trailingCommas: false,
				encodeUrls: false,
				tidyComments: true,
				removeEmptyFields: false,
				removeDuplicateFields: true,
				generateKeys: false,
				maxAuthors: undefined,
				lowercase: true,
				enclosingBraces: false,
				removeBraces: false,
				wrap: false,
				lookupDois: false,
			};
	}
};
