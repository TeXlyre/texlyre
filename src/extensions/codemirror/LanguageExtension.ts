// src/extensions/codemirror/LanguageExtension.ts
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import type { Extension } from '@codemirror/state';
import { bibtex } from 'codemirror-lang-bib';
import { latex } from 'codemirror-lang-latex';

import { withAnnotationMasking } from './annotations/annotationMasking';
import { safeTypst as typst } from './languages/safeTypstPatch';
import { rst } from './languages/rstMode';
import { createTextMateLanguageForFile } from './languages/textmateMode';
import type { detectFileType } from '../../utils/fileUtils';

export type LanguageFileType = ReturnType<typeof detectFileType>;

export interface LanguageExtensionOptions {
	fileName?: string;
	detectedByContent?: boolean;
}

export const luaLanguage = StreamLanguage.define(lua);
export const rstLanguage = StreamLanguage.define(rst);
export const tomlLanguage = StreamLanguage.define(toml);

export const latexNestedEnvironments = {
	luacode: luaLanguage,
	'luacode*': luaLanguage,
};

export const createLanguageExtension = (
	fileType: LanguageFileType,
	options: LanguageExtensionOptions = {},
): Extension[] => {
	switch (fileType) {
		case 'latex':
			return [
				withAnnotationMasking(
					latex({
						autoCloseBrackets: false,
						enableAutocomplete: false,
						fileName: options.fileName,
						nestedEnvironments: latexNestedEnvironments,
						linter: options.detectedByContent
							? { checkMissingDocumentEnv: false }
							: undefined,
					}),
				),
			];
		case 'typst':
			return [withAnnotationMasking(typst())];
		case 'bib':
			return [
				withAnnotationMasking(
					bibtex({ autoCloseBrackets: false, enableAutocomplete: false }),
				),
			];
		case 'markdown':
			return [
				markdown({
					base: markdownLanguage,
					codeLanguages: languages,
					htmlTagLanguage: html(),
				}),
			];
		case 'rst':
			return [rstLanguage];
		case 'json':
			return [json()];
		case 'yaml':
			return [yaml()];
		case 'toml':
			return [tomlLanguage];
		case 'html':
			return [html()];
		case 'css':
			return [css()];
		case 'xml':
			return [xml()];
		default:
			return createTextMateLanguageForFile(options.fileName);
	}
};
