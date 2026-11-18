// src/components/editor/EditorSidebar.tsx
import type React from 'react';

import { t } from '@/i18n';
import SidebarHeaderActions from '../common/SidebarHeaderActions';
import type { Document } from '../../types/documents';
import type { EditorSidebarView } from '../../types/editor';
import type { ProjectType } from '../../types/projects';
import type { YjsDocUrl } from '../../types/yjs';
import { FileIcon, HistoryIcon, SearchIcon, UsersIcon } from '../common/Icons';
import ResizablePanel from '../common/ResizablePanel';
import GitHistoryPanel from '../history/GitHistoryPanel';
import type { GitDiffView } from '../history/GitDiffViewer';
import DocumentExplorer from './DocumentExplorer';
import FileExplorer from './FileExplorer';
import SearchPanel from './SearchPanel';

interface EditorSidebarProps {
	activeView: EditorSidebarView;
	sidebarWidth: number;
	minSidebarWidth: number;
	maxSidebarWidth: number;
	sidebarCollapsed: boolean;
	explorerHeight: number;
	onSidebarResize: (width: number) => void;
	onSidebarCollapse: (collapsed: boolean) => void;
	onExplorerResize: (height: number) => void;
	onViewChange: (view: EditorSidebarView) => void;
	onHistorySelect: () => void;
	onOpenDiff: (view: GitDiffView) => void;
	onClearDiff: () => void;
	onNavigateToSearchResult: (
		fileId: string,
		line?: number,
		column?: number,
		documentId?: string,
		isLinkedDocument?: boolean,
	) => Promise<void>;
	documents: Document[];
	selectedDocId: string | null;
	onSelectDocument: (id: string) => void;
	onCreateDocument: () => void;
	onRenameDocument: (id: string, newName: string) => void;
	onUpdateContent: (content: string) => void;
	content: string;
	docUrl: YjsDocUrl;
	collabProjectId?: string;
	docsWithPeers: Set<string>;
	onFileSelect: (fileId: string) => Promise<void>;
	initialSelectedFile?: string;
	initialExpandedPaths?: string[];
	currentProjectId: string | null;
	onExportCurrentProject: (projectId: string) => void | Promise<void>;
	projectType?: ProjectType;
	children?: React.ReactNode;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({
	activeView,
	sidebarWidth,
	minSidebarWidth,
	maxSidebarWidth,
	sidebarCollapsed,
	explorerHeight,
	onSidebarResize,
	onSidebarCollapse,
	onExplorerResize,
	onViewChange,
	onHistorySelect,
	onOpenDiff,
	onClearDiff,
	onNavigateToSearchResult,
	documents,
	selectedDocId,
	onSelectDocument,
	onCreateDocument,
	onRenameDocument,
	onUpdateContent,
	content,
	docUrl,
	collabProjectId,
	docsWithPeers,
	onFileSelect,
	initialSelectedFile,
	initialExpandedPaths,
	currentProjectId,
	onExportCurrentProject,
	projectType,
	children,
}) => {
	const viewToggle = (
		<SidebarHeaderActions
			tabs
			actions={[
				{
					key: 'files',
					label: t('Files'),
					icon: <FileIcon />,
					active: activeView === 'files',
					onClick: () => onViewChange('files'),
				},
				{
					key: 'documents',
					label: t('Collab'),
					icon: <UsersIcon />,
					active: activeView === 'documents',
					onClick: () => onViewChange('documents'),
				},
				{
					key: 'search',
					label: t('Search'),
					icon: <SearchIcon />,
					active: activeView === 'search',
					onClick: () => onViewChange('search'),
				},
				{
					key: 'history',
					label: t('History'),
					icon: <HistoryIcon />,
					active: activeView === 'history',
					onClick: onHistorySelect,
				},
			]}
		/>
	);

	return (
		<ResizablePanel
			direction='horizontal'
			width={sidebarWidth}
			minWidth={minSidebarWidth}
			maxWidth={maxSidebarWidth}
			onResize={onSidebarResize}
			collapsed={sidebarCollapsed}
			onCollapse={onSidebarCollapse}
			className='sidebar-container'
		>
			{activeView === 'history' ? (
				<>
					{viewToggle}
					<GitHistoryPanel
						projectId={currentProjectId}
						onOpenDiff={onOpenDiff}
						onClearDiff={onClearDiff}
					/>
				</>
			) : (
				<ResizablePanel
					direction='vertical'
					height={explorerHeight}
					minHeight={350}
					maxHeight='90%'
					alignment='end'
					onResize={onExplorerResize}
					collapsible={false}
					maintainAlignment={true}
					className='explorer-container'
				>
					{viewToggle}
					{activeView === 'search' ? (
						<SearchPanel onNavigateToResult={onNavigateToSearchResult} />
					) : activeView === 'documents' ? (
						<DocumentExplorer
							documents={documents}
							selectedDocId={selectedDocId}
							onSelectDocument={onSelectDocument}
							onCreateDocument={onCreateDocument}
							onRenameDocument={onRenameDocument}
							onUpdateContent={onUpdateContent}
							content={content}
							docUrl={docUrl}
							collabProjectId={collabProjectId}
							docsWithPeers={docsWithPeers}
						/>
					) : (
						<FileExplorer
							onFileSelect={onFileSelect}
							initialSelectedFile={initialSelectedFile}
							initialExpandedPaths={initialExpandedPaths}
							currentProjectId={currentProjectId}
							onExportCurrentProject={onExportCurrentProject}
							projectType={projectType}
							collabProjectId={collabProjectId}
							docsWithPeers={docsWithPeers}
						/>
					)}
				</ResizablePanel>
			)}
			{children}
		</ResizablePanel>
	);
};

export default EditorSidebar;
