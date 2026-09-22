// src/components/editor/FileDocumentController.tsx
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { createNamedLogger } from '@/logging';
import { EditorTabsProvider } from '../../contexts/EditorTabsContext';
import { SearchProvider } from '../../contexts/SearchContext';
import { useEditorLayout } from '../../hooks/editor/useEditorLayout';
import { useEditorNavigation } from '../../hooks/editor/useEditorNavigation';
import { useEditorOutline } from '../../hooks/editor/useEditorOutline';
import { useEditorOutput } from '../../hooks/editor/useEditorOutput';
import { useAuth } from '../../hooks/useAuth';
import { usePeerDocumentTracking } from '../../hooks/usePeerDocumentTracking';
import type { Document } from '../../types/documents';
import type { Project } from '../../types/projects';
import type { YjsDocUrl } from '../../types/yjs';
import GitDiffViewer, { type GitDiffView } from '../history/GitDiffViewer';
import ProjectExportModal from '../project/ProjectExportModal';
import Editor from './Editor';
import EditorOutline from './EditorOutline';
import EditorOutputPanels from './EditorOutputPanels';
import EditorSidebar from './EditorSidebar';
import EditorTabs from './EditorTabs';

const moduleLog = createNamedLogger('FileDocumentController');

interface FileDocumentControllerProps {
	documents: Document[];
	selectedDocId: string | null;
	onSelectDocument: (id: string) => void;
	onCreateDocument: () => void;
	onRenameDocument: (id: string, newName: string) => void;
	onUpdateContent: (content: string) => void;
	content: string;
	docUrl: YjsDocUrl;
	targetDocId?: string | null;
	targetFilePath?: string | null;
}

const FileDocumentControllerContent: React.FC<FileDocumentControllerProps> = ({
	documents,
	selectedDocId,
	onSelectDocument,
	onCreateDocument,
	onRenameDocument,
	onUpdateContent,
	content,
	docUrl,
	targetDocId,
	targetFilePath,
}) => {
	const { getProjectById } = useAuth();
	const {
		projectId: collabProjectId,
		docsWithPeers,
		setLocalOpenDocument,
	} = usePeerDocumentTracking(docUrl);
	const output = useEditorOutput();
	const layout = useEditorLayout();
	const navigation = useEditorNavigation({
		documents,
		selectedDocId,
		onSelectDocument,
		onUpdateContent,
		content,
		targetDocId,
		targetFilePath,
		setOutputForFileName: output.setOutputForFileName,
	});
	const outline = useEditorOutline({
		isEditingFile: navigation.isEditingFile,
		fileName: navigation.fileName,
		linkedFileInfo: navigation.linkedFileInfo,
		content,
		currentEditorContent: navigation.currentEditorContent,
		outlinePreview: layout.outlinePreview,
		onRefreshFileContent: navigation.refreshCurrentFileContent,
		onContentRefreshed: navigation.setCurrentEditorContent,
	});
	const [gitDiffView, setGitDiffView] = useState<GitDiffView | null>(null);
	const [showCurrentProjectExportModal, setShowCurrentProjectExportModal] =
		useState(false);
	const [currentProjectForExport, setCurrentProjectForExport] =
		useState<Project | null>(null);

	const handleExportCurrentProject = async (projectId: string) => {
		try {
			const project = await getProjectById(projectId);
			if (project) {
				setCurrentProjectForExport(project);
				setShowCurrentProjectExportModal(true);
			}
		} catch (error) {
			moduleLog.error('Error loading project for export:', error);
		}
	};

	const handleSwitchToHistory = useCallback(() => {
		setGitDiffView(null);
		navigation.setActiveView('history');
	}, [navigation.setActiveView]);

	const handleLatexOutputCollapse = useCallback(
		(collapsed: boolean) => {
			layout.handleLatexOutputCollapse(collapsed);
			if (collapsed) output.clearTemporaryLatexExpand();
		},
		[layout.handleLatexOutputCollapse, output.clearTemporaryLatexExpand],
	);

	const handleTypstOutputCollapse = useCallback(
		(collapsed: boolean) => {
			layout.handleTypstOutputCollapse(collapsed);
			if (collapsed) output.clearTemporaryTypstExpand();
		},
		[layout.handleTypstOutputCollapse, output.clearTemporaryTypstExpand],
	);

	const handleExternalOutputCollapse = useCallback(
		(collapsed: boolean) => {
			layout.handleExternalOutputCollapse(collapsed);
			if (collapsed) output.clearTemporaryExternalExpand();
		},
		[layout.handleExternalOutputCollapse, output.clearTemporaryExternalExpand],
	);

	useEffect(() => {
		const activeDocId =
			!navigation.isEditingFile && selectedDocId
				? selectedDocId
				: navigation.isEditingFile && navigation.linkedDocumentId
					? navigation.linkedDocumentId
					: null;
		setLocalOpenDocument(activeDocId);
	}, [
		navigation.isEditingFile,
		navigation.linkedDocumentId,
		selectedDocId,
		setLocalOpenDocument,
	]);

	const currentProjectId = sessionStorage.getItem('currentProjectId');
	const hideOutputs =
		navigation.activeView === 'history' && gitDiffView !== null;

	return (
		<div
			className='main-content'
			data-mobile-outline-preview={
				layout.hasOutlinePreview &&
				navigation.activeView !== 'history' &&
				outline.showOutline &&
				layout.outlinePreview
					? 'true'
					: undefined
			}
			data-mobile-outline-maximized={
				layout.hasOutlineMaximize &&
				navigation.activeView !== 'history' &&
				outline.showOutline &&
				layout.outlineMaximized
					? 'true'
					: undefined
			}
		>
			<EditorSidebar
				activeView={navigation.activeView}
				sidebarWidth={layout.sidebarWidth}
				minSidebarWidth={layout.currentLayout?.minFileExplorerWidth || 200}
				maxSidebarWidth={layout.currentLayout?.maxFileExplorerWidth || 500}
				sidebarCollapsed={layout.sidebarCollapsed}
				explorerHeight={layout.explorerHeight}
				onSidebarResize={layout.handleSidebarResize}
				onSidebarCollapse={layout.handleSidebarCollapse}
				onExplorerResize={layout.handleExplorerResize}
				onViewChange={navigation.setActiveView}
				onHistorySelect={handleSwitchToHistory}
				onOpenDiff={setGitDiffView}
				onClearDiff={() => setGitDiffView(null)}
				onNavigateToSearchResult={navigation.handleSearchResultNavigate}
				documents={documents}
				selectedDocId={selectedDocId}
				onSelectDocument={navigation.handleUserDocumentSelect}
				onCreateDocument={onCreateDocument}
				onRenameDocument={onRenameDocument}
				onUpdateContent={onUpdateContent}
				content={content}
				docUrl={docUrl}
				collabProjectId={collabProjectId}
				docsWithPeers={docsWithPeers}
				onFileSelect={navigation.handleUserFileSelect}
				initialSelectedFile={navigation.initialSelectedFile}
				initialExpandedPaths={navigation.initialExpandedPaths}
				currentProjectId={currentProjectId}
				onExportCurrentProject={handleExportCurrentProject}
				projectType={output.projectType}
			>
				{navigation.activeView !== 'history' &&
					outline.showOutline &&
					outline.outlineKind && (
						<EditorOutline
							kind={outline.outlineKind}
							content={navigation.currentEditorContent}
							fileName={outline.outlineFileName}
							currentLine={outline.currentLine}
							onSectionClick={outline.handleOutlineSectionClick}
							onRefresh={outline.handleOutlineRefresh}
							linkedFileInfo={navigation.linkedFileInfo}
							currentFilePath={navigation.currentFilePath}
							isEditingFile={navigation.isEditingFile}
							{...layout.outlineThemeControls}
						/>
					)}
			</EditorSidebar>

			<div className='editor-container-outer'>
				<div
					className='editor-container'
					style={{ flex: 1, minWidth: 0, position: 'relative' }}
				>
					<EditorTabs onTabSwitch={navigation.handleTabSwitch} />
					<div className='git-editor-surface'>
						{!navigation.bootstrapResolved ? (
							<div className='file-loading-overlay'>
								<div className='loading-spinner' />
							</div>
						) : (
							<Editor
								content={
									navigation.isEditingFile
										? navigation.fileContentReady
											? (navigation.loadedFile?.content ?? '')
											: ''
										: content
								}
								documentId={selectedDocId || ''}
								onUpdateContent={navigation.handleUpdateContent}
								isDocumentSelected={
									navigation.bootstrapResolved &&
									(navigation.fileContentReady ||
										(!navigation.isEditingFile && !!selectedDocId))
								}
								isBinaryFile={
									navigation.isEditingFile && navigation.isBinaryFile
								}
								fileName={
									navigation.isEditingFile
										? navigation.fileName
										: navigation.linkedFileInfo.fileName
								}
								mimeType={
									navigation.isEditingFile
										? navigation.mimeType
										: navigation.linkedFileInfo.mimeType
								}
								fileId={
									navigation.isEditingFile
										? navigation.selectedFileId || ''
										: navigation.linkedFileInfo.fileId || ''
								}
								docUrl={docUrl}
								documentSelectionChange={
									navigation.isEditingFile
										? navigation.fileSelectionChange
										: navigation.documentSelectionChange
								}
								isEditingFile={navigation.isEditingFile}
								onSelectDocument={navigation.handleDocumentSelect}
								onSwitchToDocuments={navigation.handleSwitchToDocuments}
								linkedDocumentId={
									navigation.isEditingFile
										? navigation.linkedDocumentId
										: navigation.linkedFileInfo.fileName
											? selectedDocId
											: null
								}
								documents={documents}
								linkedFileInfo={navigation.linkedFileInfo}
								toolbarVisible={layout.toolbarVisible}
								onToolbarToggle={layout.handleToolbarToggle}
							/>
						)}

						{navigation.activeView === 'history' && gitDiffView && (
							<div className='git-diff-editor-overlay'>
								<GitDiffViewer view={gitDiffView} />
							</div>
						)}
					</div>
				</div>

				{navigation.isFileLoading && (
					<div className='file-loading-overlay'>
						<div className='loading-spinner' />
					</div>
				)}

				<EditorOutputPanels
					hidden={hideOutputs}
					selectedDocId={selectedDocId}
					documents={documents}
					linkedFileInfo={navigation.linkedFileInfo}
					showLatexOutput={output.showLatexOutput}
					showTypstOutput={output.showTypstOutput}
					activeExternalProvider={output.activeExternalProvider}
					latexOutputWidth={layout.latexOutputWidth}
					typstOutputWidth={layout.typstOutputWidth}
					externalOutputWidth={layout.externalOutputWidth}
					latexOutputCollapsed={layout.latexOutputCollapsed}
					typstOutputCollapsed={layout.typstOutputCollapsed}
					externalOutputCollapsed={layout.externalOutputCollapsed}
					temporaryLatexExpand={output.temporaryLatexExpand}
					temporaryTypstExpand={output.temporaryTypstExpand}
					temporaryExternalExpand={output.temporaryExternalExpand}
					onLatexResize={layout.handleLatexOutputWidthResize}
					onTypstResize={layout.handleTypstOutputWidthResize}
					onExternalResize={layout.handleExternalOutputWidthResize}
					onLatexCollapse={handleLatexOutputCollapse}
					onTypstCollapse={handleTypstOutputCollapse}
					onExternalCollapse={handleExternalOutputCollapse}
					onNavigateToLinkedFile={navigation.handleNavigateToLinkedFile}
					onExpandLatexOutput={output.handleLatexOutputExpand}
					onExpandTypstOutput={output.handleTypstOutputExpand}
					onExpandExternalOutput={output.handleExternalOutputExpand}
				/>
			</div>

			{showCurrentProjectExportModal && currentProjectForExport && (
				<ProjectExportModal
					isOpen={showCurrentProjectExportModal}
					onClose={() => setShowCurrentProjectExportModal(false)}
					selectedProjects={[currentProjectForExport]}
				/>
			)}
		</div>
	);
};

const FileDocumentController: React.FC<FileDocumentControllerProps> = (
	props,
) => {
	return (
		<SearchProvider>
			<EditorTabsProvider>
				<FileDocumentControllerContent {...props} />
			</EditorTabsProvider>
		</SearchProvider>
	);
};

export default FileDocumentController;
