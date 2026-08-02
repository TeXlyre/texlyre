// src/extensions/codemirror/toolbar/yamlItems.tsx
import type { EditorView } from '@codemirror/view';
import { renderToString } from 'react-dom/server';

import { t } from '@/i18n';
import {
	KeyIcon,
	CommentIcon,
	MinusIcon,
	ToolbarDescriptionIcon,
	ToolbarBulletListIcon,
	ToolbarCodeBlockIcon,
	ToolbarCodeInlineIcon,
	ToolbarLabelIcon,
	ToolbarReferenceIcon,
} from '../../../components/common/Icons';
import { insertText } from './helpers';
import type { ToolbarItem } from './types';

export const createKeyValue = (): ToolbarItem => ({
	key: 'yaml-key-value',
	label: t('Key/Value Pair'),
	icon: renderToString(<KeyIcon />),
	command: (view: EditorView) => insertText(view, 'key: value', -10),
});

export const createMapping = (): ToolbarItem => ({
	key: 'yaml-mapping',
	label: t('Mapping'),
	icon: renderToString(<ToolbarDescriptionIcon />),
	command: (view: EditorView) => insertText(view, 'key:\n\tvalue', -11),
});

export const createListItem = (): ToolbarItem => ({
	key: 'yaml-list-item',
	label: t('List Item'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => insertText(view, '- ', 0),
});

export const createBlockScalar = (): ToolbarItem => ({
	key: 'yaml-block-scalar',
	label: t('Block Scalar'),
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => insertText(view, '|\n\t', 0),
});

export const createFoldedScalar = (): ToolbarItem => ({
	key: 'yaml-folded-scalar',
	label: t('Folded Scalar'),
	icon: renderToString(<ToolbarCodeInlineIcon />),
	command: (view: EditorView) => insertText(view, '>\n\t', 0),
});

export const createAnchor = (): ToolbarItem => ({
	key: 'yaml-anchor',
	label: t('Anchor'),
	icon: renderToString(<ToolbarLabelIcon />),
	command: (view: EditorView) => insertText(view, '&anchor', 0),
});

export const createAlias = (): ToolbarItem => ({
	key: 'yaml-alias',
	label: t('Alias'),
	icon: renderToString(<ToolbarReferenceIcon />),
	command: (view: EditorView) => insertText(view, '*anchor', 0),
});

export const createComment = (): ToolbarItem => ({
	key: 'yaml-comment',
	label: t('Comment'),
	icon: renderToString(<CommentIcon />),
	command: (view: EditorView) => insertText(view, '# ', 0),
});

export const createDocumentSeparator = (): ToolbarItem => ({
	key: 'yaml-document-separator',
	label: t('Document Separator'),
	icon: renderToString(<MinusIcon />),
	command: (view: EditorView) => insertText(view, '\n---\n', 0),
});
