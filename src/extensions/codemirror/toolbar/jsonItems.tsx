// src/extensions/codemirror/toolbar/jsonItems.tsx
import type { EditorView } from '@codemirror/view';
import { renderToString } from 'react-dom/server';

import { t } from '@/i18n';
import {
	KeyIcon,
	CheckIcon,
	MinusIcon,
	ToolbarDescriptionIcon,
	ToolbarBulletListIcon,
	ToolbarQuoteIcon,
	ToolbarNumberListIcon,
} from '../../../components/common/Icons';
import { insertText } from './helpers';
import type { ToolbarItem } from './types';

export const createKeyValue = (): ToolbarItem => ({
	key: 'json-key-value',
	label: t('Key/Value Pair'),
	icon: renderToString(<KeyIcon />),
	command: (view: EditorView) => insertText(view, '"key": "value"', -12),
});

export const createObject = (): ToolbarItem => ({
	key: 'json-object',
	label: t('Object'),
	icon: renderToString(<ToolbarDescriptionIcon />),
	command: (view: EditorView) => insertText(view, '{\n\t\n}', -2),
});

export const createArray = (): ToolbarItem => ({
	key: 'json-array',
	label: t('Array'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => insertText(view, '[\n\t\n]', -2),
});

export const createString = (): ToolbarItem => ({
	key: 'json-string',
	label: t('String'),
	icon: renderToString(<ToolbarQuoteIcon />),
	command: (view: EditorView) => insertText(view, '""', -1),
});

export const createNumber = (): ToolbarItem => ({
	key: 'json-number',
	label: t('Number'),
	icon: renderToString(<ToolbarNumberListIcon />),
	command: (view: EditorView) => insertText(view, '0', 0),
});

export const createBoolean = (): ToolbarItem => ({
	key: 'json-boolean',
	label: t('Boolean'),
	icon: renderToString(<CheckIcon />),
	command: (view: EditorView) => insertText(view, 'true', 0),
});

export const createNull = (): ToolbarItem => ({
	key: 'json-null',
	label: t('Null'),
	icon: renderToString(<MinusIcon />),
	command: (view: EditorView) => insertText(view, 'null', 0),
});
