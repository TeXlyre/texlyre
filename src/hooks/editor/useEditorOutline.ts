// src/hooks/editor/useEditorOutline.ts
import { useEffect, useState } from 'react';

import { createNamedLogger } from '@/logging';
import {
	getTextMateLanguageForFile,
	grammarsReady,
} from '../../extensions/codemirror/languages/textmateRegistry';
import { hasLSPDocumentSymbolProvider } from '../../extensions/codemirror/lsp/lspDocumentSymbols';
import { genericLSPService } from '../../services/GenericLSPService';
import type { LinkedFileInfoState } from '../../types/editor';
import {
	isLatexContent,
	isLatexFile,
	isTypstContent,
	isTypstFile,
} from '../../utils/fileUtils';
import { gotoEditor } from '../../utils/editorNavigator';
import { useEditor } from '../useEditor';
import { useTheme } from '../useTheme';

const moduleLog = createNamedLogger('useEditorOutline');

export type EditorOutlineKind = 'lsp' | 'latex' | 'typst' | 'textmate';

interface UseEditorOutlineOptions {
	isEditingFile: boolean;
	fileName: string;
	linkedFileInfo: LinkedFileInfoState;
	content: string;
	currentEditorContent: string;
	outlinePreview: boolean;
	onRefreshFileContent: () => Promise<string | ArrayBuffer | undefined>;
	onContentRefreshed: (content: string) => void;
}

export const useEditorOutline = ({
	isEditingFile,
	fileName,
	linkedFileInfo,
	content,
	currentEditorContent,
	outlinePreview,
	onRefreshFileContent,
	onContentRefreshed,
}: UseEditorOutlineOptions) => {
	const { currentLayout, currentThemePlugin } = useTheme();
	const { editorSettings } = useEditor();
	const { builtinOutline, lspOutline } = editorSettings.languageFeatures;
	const [currentLine, setCurrentLine] = useState(1);
	const [, setLspCapabilitiesVersion] = useState(0);
	const [textMateRegistryReady, setTextMateRegistryReady] = useState(false);

	const outlineFileName = isEditingFile ? fileName : linkedFileInfo.fileName;

	const showOutline = (() => {
		const isTexFile = isEditingFile && fileName && isLatexFile(fileName);
		const isTypFile = isEditingFile && fileName && isTypstFile(fileName);
		const isDocumentLinkedToTex =
			!isEditingFile &&
			linkedFileInfo.fileName &&
			isLatexFile(linkedFileInfo.fileName);
		const isDocumentLinkedToTyp =
			!isEditingFile &&
			linkedFileInfo.fileName &&
			isTypstFile(linkedFileInfo.fileName);
		const hasLatexContent =
			!isEditingFile &&
			!linkedFileInfo.fileName &&
			content &&
			isLatexContent(content);
		const hasTypstContent =
			!isEditingFile &&
			!linkedFileInfo.fileName &&
			content &&
			isTypstContent(content);
		const hasLSPOutline =
			lspOutline &&
			Boolean(outlineFileName && hasLSPDocumentSymbolProvider(outlineFileName));
		const hasTextMateOutline =
			builtinOutline &&
			textMateRegistryReady &&
			Boolean(getTextMateLanguageForFile(outlineFileName));
		const hasBuiltinOutline =
			builtinOutline &&
			(isTexFile ||
				isTypFile ||
				isDocumentLinkedToTex ||
				isDocumentLinkedToTyp ||
				hasLatexContent ||
				hasTypstContent);

		return Boolean(hasBuiltinOutline || hasLSPOutline || hasTextMateOutline);
	})();

	const outlineKind = ((): EditorOutlineKind | null => {
		const isTypFile =
			(isEditingFile && isTypstFile(fileName)) ||
			(!isEditingFile &&
				!!linkedFileInfo.filePath &&
				isTypstFile(linkedFileInfo.filePath)) ||
			(!isEditingFile &&
				!linkedFileInfo.filePath &&
				isTypstContent(currentEditorContent));
		const isTexFile =
			(isEditingFile && isLatexFile(fileName)) ||
			(!isEditingFile &&
				!!linkedFileInfo.filePath &&
				isLatexFile(linkedFileInfo.filePath)) ||
			(!isEditingFile &&
				!linkedFileInfo.filePath &&
				isLatexContent(currentEditorContent));

		if (
			lspOutline &&
			outlineFileName &&
			hasLSPDocumentSymbolProvider(outlineFileName)
		) {
			return 'lsp';
		}
		if (!builtinOutline) return null;
		if (isTexFile) return 'latex';
		if (isTypFile) return 'typst';
		if (getTextMateLanguageForFile(outlineFileName)) return 'textmate';
		return null;
	})();

	const handleOutlineSectionClick = (line: number, column?: number) => {
		gotoEditor(null, { line, column });

		if (
			currentLayout?.outlineControls?.returnToEditorOnNavigate &&
			!outlinePreview
		) {
			currentThemePlugin?.requestView?.('editor');
		}
	};

	const handleOutlineRefresh = async () => {
		if (!isEditingFile) return;

		try {
			const refreshedContent = await onRefreshFileContent();
			if (!refreshedContent) return;

			if (typeof refreshedContent === 'string') {
				onContentRefreshed(refreshedContent);
			} else if (refreshedContent instanceof ArrayBuffer) {
				try {
					onContentRefreshed(new TextDecoder().decode(refreshedContent));
				} catch {
					onContentRefreshed('');
				}
			}
		} catch (error) {
			moduleLog.error('Error refreshing file content for outline:', error);
		}
	};

	useEffect(() => {
		const handleCursorUpdate = (event: Event) => {
			const customEvent = event as CustomEvent;
			if (customEvent.detail && typeof customEvent.detail.line === 'number') {
				setCurrentLine(customEvent.detail.line);
			}
		};

		document.addEventListener('editor-cursor-update', handleCursorUpdate);
		return () => {
			document.removeEventListener('editor-cursor-update', handleCursorUpdate);
		};
	}, []);

	useEffect(() => {
		if (!lspOutline) return;

		const refreshLSPCapabilities = () => {
			setLspCapabilitiesVersion((version) => version + 1);
		};
		const unsubscribeCapabilities = genericLSPService.onCapabilitiesChange(
			refreshLSPCapabilities,
		);
		const unsubscribeStatus = genericLSPService.onStatusChange(
			refreshLSPCapabilities,
		);

		return () => {
			unsubscribeCapabilities();
			unsubscribeStatus();
		};
	}, [lspOutline]);

	useEffect(() => {
		let cancelled = false;
		void grammarsReady().then(() => {
			if (!cancelled) setTextMateRegistryReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return {
		showOutline,
		outlineKind,
		outlineFileName,
		currentLine,
		handleOutlineSectionClick,
		handleOutlineRefresh,
	};
};
