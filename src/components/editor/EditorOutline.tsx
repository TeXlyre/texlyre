// src/components/editor/EditorOutline.tsx
import type React from 'react';

import type { EditorOutlineKind } from '../../hooks/editor/useEditorOutline';
import type { LinkedFileInfoState } from '../../types/editor';
import LSPOutline from './LSPOutline';
import LaTeXOutline from './LaTeXOutline';
import TextMateOutline from './TextMateOutline';
import TypstOutline from './TypstOutline';

interface OutlineThemeControls {
	previewEnabled?: boolean;
	onPreviewToggle?: () => void;
	maximized?: boolean;
	onMaximizeToggle?: () => void;
	onCollapsedChange?: (collapsed: boolean) => void;
}

interface EditorOutlineProps extends OutlineThemeControls {
	kind: EditorOutlineKind;
	content: string;
	fileName?: string;
	currentLine: number;
	onSectionClick: (line: number, column?: number) => void;
	onRefresh: () => Promise<void>;
	linkedFileInfo: LinkedFileInfoState;
	currentFilePath?: string;
	isEditingFile: boolean;
}

const EditorOutline: React.FC<EditorOutlineProps> = ({
	kind,
	content,
	fileName,
	currentLine,
	onSectionClick,
	onRefresh,
	linkedFileInfo,
	currentFilePath,
	isEditingFile,
	previewEnabled,
	onPreviewToggle,
	maximized,
	onMaximizeToggle,
	onCollapsedChange,
}) => {
	const themeControls = {
		previewEnabled,
		onPreviewToggle,
		maximized,
		onMaximizeToggle,
		onCollapsedChange,
	};

	if (kind === 'lsp' && fileName) {
		return (
			<LSPOutline
				content={content}
				fileName={fileName}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				{...themeControls}
			/>
		);
	}

	if (kind === 'latex') {
		return (
			<LaTeXOutline
				content={content}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				linkedFileInfo={linkedFileInfo}
				currentFilePath={currentFilePath}
				isEditingFile={isEditingFile}
				{...themeControls}
			/>
		);
	}

	if (kind === 'typst') {
		return (
			<TypstOutline
				content={content}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				linkedFileInfo={linkedFileInfo}
				currentFilePath={currentFilePath}
				isEditingFile={isEditingFile}
				{...themeControls}
			/>
		);
	}

	if (kind === 'textmate') {
		return (
			<TextMateOutline
				content={content}
				fileName={fileName ?? ''}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				{...themeControls}
			/>
		);
	}

	return null;
};

export default EditorOutline;
