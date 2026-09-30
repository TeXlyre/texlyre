// src/components/editor/EditorOutputPanels.tsx
import React from 'react';

import { popoutViewerService } from '../../services/PopoutViewerService';
import type { TypesetterProvider } from '../../types/compilation';
import type { Document } from '../../types/documents';
import type { LinkedFileInfoState } from '../../types/editor';
import ResizablePanel from '../common/ResizablePanel';
import ExternalTypesetterOutput from '../output/ExternalTypesetterOutput';
import LaTeXOutput from '../output/LaTeXOutput';
import TypstOutput from '../output/TypstOutput';

interface EditorOutputPanelsProps {
	hidden: boolean;
	selectedDocId: string | null;
	documents: Document[];
	linkedFileInfo: LinkedFileInfoState;
	showLatexOutput: boolean;
	showTypstOutput: boolean;
	activeExternalProvider: TypesetterProvider | null;
	latexOutputWidth: number;
	typstOutputWidth: number;
	externalOutputWidth: number;
	latexOutputCollapsed: boolean;
	typstOutputCollapsed: boolean;
	externalOutputCollapsed: boolean;
	temporaryLatexExpand: boolean;
	temporaryTypstExpand: boolean;
	temporaryExternalExpand: boolean;
	onLatexResize: (width: number) => void;
	onTypstResize: (width: number) => void;
	onExternalResize: (width: number) => void;
	onLatexCollapse: (collapsed: boolean) => void;
	onTypstCollapse: (collapsed: boolean) => void;
	onExternalCollapse: (collapsed: boolean) => void;
	onNavigateToLinkedFile: () => void;
	onExpandLatexOutput: () => void;
	onExpandTypstOutput: () => void;
	onExpandExternalOutput: () => void;
}

const EditorOutputPanels: React.FC<EditorOutputPanelsProps> = ({
	hidden,
	selectedDocId,
	documents,
	linkedFileInfo,
	showLatexOutput,
	showTypstOutput,
	activeExternalProvider,
	latexOutputWidth,
	typstOutputWidth,
	externalOutputWidth,
	latexOutputCollapsed,
	typstOutputCollapsed,
	externalOutputCollapsed,
	temporaryLatexExpand,
	temporaryTypstExpand,
	temporaryExternalExpand,
	onLatexResize,
	onTypstResize,
	onExternalResize,
	onLatexCollapse,
	onTypstCollapse,
	onExternalCollapse,
	onNavigateToLinkedFile,
	onExpandLatexOutput,
	onExpandTypstOutput,
	onExpandExternalOutput,
}) => {
	if (hidden) return null;

	return (
		<>
			{showLatexOutput && (
				<ResizablePanel
					direction='horizontal'
					width={latexOutputWidth}
					minWidth={300}
					maxWidth='80%'
					alignment='start'
					onResize={onLatexResize}
					collapsed={latexOutputCollapsed && !temporaryLatexExpand}
					onCollapse={onLatexCollapse}
					className='latex-output-container'
				>
					<LaTeXOutput
						selectedDocId={selectedDocId}
						documents={documents}
						onNavigateToLinkedFile={onNavigateToLinkedFile}
						onExpandLatexOutput={
							popoutViewerService.isWindowOpen()
								? undefined
								: onExpandLatexOutput
						}
						linkedFileInfo={linkedFileInfo}
					/>
				</ResizablePanel>
			)}

			{showTypstOutput && (
				<ResizablePanel
					direction='horizontal'
					width={typstOutputWidth}
					minWidth={300}
					maxWidth='80%'
					alignment='start'
					onResize={onTypstResize}
					collapsed={typstOutputCollapsed && !temporaryTypstExpand}
					onCollapse={onTypstCollapse}
					className='typst-output-container'
				>
					<TypstOutput
						selectedDocId={selectedDocId}
						documents={documents}
						onNavigateToLinkedFile={onNavigateToLinkedFile}
						onExpandTypstOutput={
							popoutViewerService.isWindowOpen()
								? undefined
								: onExpandTypstOutput
						}
						linkedFileInfo={linkedFileInfo}
					/>
				</ResizablePanel>
			)}

			{activeExternalProvider && (
				<ResizablePanel
					direction='horizontal'
					width={externalOutputWidth}
					minWidth={300}
					maxWidth='80%'
					alignment='start'
					onResize={onExternalResize}
					collapsed={externalOutputCollapsed && !temporaryExternalExpand}
					onCollapse={onExternalCollapse}
					className='external-output-container'
				>
					<ExternalTypesetterOutput
						provider={activeExternalProvider}
						onExpandExternalOutput={
							popoutViewerService.isWindowOpen()
								? undefined
								: onExpandExternalOutput
						}
						linkedFileInfo={linkedFileInfo}
					/>
				</ResizablePanel>
			)}
		</>
	);
};

export default React.memo(EditorOutputPanels);
