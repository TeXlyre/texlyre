// src/extensions/codemirror/toolbar/tomlItems.tsx
import type { EditorView } from '@codemirror/view';
import { renderToString } from 'react-dom/server';

import { t } from '@/i18n';
import {
	KeyIcon,
	GridIcon,
	CommentIcon,
	ToolbarTableIcon,
	ToolbarDescriptionIcon,
	ToolbarBulletListIcon,
	ToolbarQuoteIcon,
	ToolbarCodeBlockIcon,
} from '../../../components/common/Icons';
import { insertText } from './helpers';
import type { ToolbarItem } from './types';

export const createKeyValue = (): ToolbarItem => ({
	key: 'toml-key-value',
	label: t('Key/Value Pair'),
	icon: renderToString(<KeyIcon />),
	command: (view: EditorView) => insertText(view, 'key = "value"', -11),
});

export const createTable = (): ToolbarItem => ({
	key: 'toml-table',
	label: t('Table'),
	icon: renderToString(<ToolbarTableIcon />),
	command: (view: EditorView) => insertText(view, '[table]\n', -2),
});

export const createArrayOfTables = (): ToolbarItem => ({
	key: 'toml-array-of-tables',
	label: t('Array of Tables'),
	icon: renderToString(<GridIcon />),
	command: (view: EditorView) => insertText(view, '[[table]]\n', -3),
});

export const createInlineTable = (): ToolbarItem => ({
	key: 'toml-inline-table',
	label: t('Inline Table'),
	icon: renderToString(<ToolbarDescriptionIcon />),
	command: (view: EditorView) => insertText(view, '{ key = "value" }', -13),
});

export const createArray = (): ToolbarItem => ({
	key: 'toml-array',
	label: t('Array'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => insertText(view, '[\n\t\n]', -2),
});

export const createString = (): ToolbarItem => ({
	key: 'toml-string',
	label: t('String'),
	icon: renderToString(<ToolbarQuoteIcon />),
	command: (view: EditorView) => insertText(view, '""', -1),
});

export const createMultilineString = (): ToolbarItem => ({
	key: 'toml-multiline-string',
	label: t('Multiline String'),
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => insertText(view, '"""\n\n"""', -4),
});

export const createComment = (): ToolbarItem => ({
	key: 'toml-comment',
	label: t('Comment'),
	icon: renderToString(<CommentIcon />),
	command: (view: EditorView) => insertText(view, '# ', 0),
});
