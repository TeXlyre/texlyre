// src/components/editor/FileTreeItem.tsx
import { t } from '@/i18n';
import type React from 'react';

import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { FileNode } from '../../types/files';
import { isTemporaryFile } from '../../utils/fileUtils';
import {
  CopyUrlIcon,
  DownloadIcon,
  DuplicateIcon,
  EditIcon,
  FileIcon,
  UnknownFileIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  InfoIcon,
  LinkIcon,
  MoreIcon,
  MoveIcon,
  TrashIcon,
  UnlinkIcon,
  UploadIcon
} from
  '../common/Icons';
import DropdownMenu from '../common/DropdownMenu';

interface FileTreeItemProps {
  node: FileNode;
  level: number;
  selectedFileId: string | null;
  expandedFolders: Set<string>;
  renamingFileId: string | null;
  renameValue: string;
  activeMenu: string | null;
  dragOverTarget: string | null;
  enableFileSystemDragDrop: boolean;
  enableInternalDragDrop: boolean;
  creatingNewItem: { type: 'file' | 'directory'; parentPath: string; } | null;
  newItemName: string;
  onFileSelect: (node: FileNode) => void;
  onToggleFolder: (folderId: string) => void;
  onStartRename: (node: FileNode) => void;
  onSaveRename: (node: FileNode) => void;
  onCancelRename: () => void;
  onRenameKeyDown: (e: React.KeyboardEvent, node: FileNode) => void;
  onSetRenameValue: (value: string) => void;
  onSetActiveMenu: (id: string | null) => void;
  onLinkToDocument: (fileId: string) => void;
  onUnlinkFromDocument: (fileId: string) => void;
  onMoveFile: (node: FileNode) => void;
  onDuplicateFile: (node: FileNode) => void;
  onCopyPath: (node: FileNode) => void;
  onExportFile: (node: FileNode) => void;
  onShowProperties: (node: FileNode) => void;
  onExportFolder: (node: FileNode) => void;
  onCreateFileInFolder: (folderId: string, folderPath: string) => void;
  onCreateSubfolder: (parentPath: string) => void;
  onUploadToFolder: (folderPath: string) => void;
  onExpandAllSubfolders: (node: FileNode) => void;
  onCollapseAllSubfolders: (node: FileNode) => void;
  onDeleteFileOrDirectory: (fileId: string) => void;
  onDragStart: (e: React.DragEvent, node: FileNode) => void;
  onDropOnDirectory: (e: React.DragEvent, targetNode: FileNode) => void;
  onSetDragOverTarget: (target: string | null) => void;
  onSetNewItemName: (value: string) => void;
  onConfirmNewItem: () => void;
  onCancelNewItem: () => void;
  onNewItemKeyDown: (e: React.KeyboardEvent) => void;
  menuRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({
  node,
  level,
  selectedFileId,
  expandedFolders,
  renamingFileId,
  renameValue,
  activeMenu,
  dragOverTarget,
  enableFileSystemDragDrop,
  enableInternalDragDrop,
  creatingNewItem,
  newItemName,
  onFileSelect,
  onToggleFolder,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onRenameKeyDown,
  onSetRenameValue,
  onSetActiveMenu,
  onLinkToDocument,
  onUnlinkFromDocument,
  onMoveFile,
  onDuplicateFile,
  onCopyPath,
  onExportFile,
  onShowProperties,
  onExportFolder,
  onCreateFileInFolder,
  onCreateSubfolder,
  onUploadToFolder,
  onExpandAllSubfolders,
  onCollapseAllSubfolders,
  onDeleteFileOrDirectory,
  onDragStart,
  onDropOnDirectory,
  onSetDragOverTarget,
  onSetNewItemName,
  onConfirmNewItem,
  onCancelNewItem,
  onNewItemKeyDown,
  menuRefs
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const hasDocument = !!node.documentId;
  const isDragOver = dragOverTarget === node.id;
  const isRenaming = renamingFileId === node.id;

  const hasCompatibleViewer = (node: FileNode): boolean => {
    if (node.type !== 'file') return false;
    return !!pluginRegistry.getViewerForFile(node.name, node.mimeType);
  };

  const hasViewer = hasCompatibleViewer(node);

  const getViewerIcon = (node: FileNode): React.ComponentType | null => {
    if (node.type !== 'file') return null;
    const viewer = pluginRegistry.getViewerForFile(node.name, node.mimeType);
    return viewer?.icon || null;
  };

  const shouldShowLinkButton =
    node.type === 'file' && !node.isBinary && !isTemporaryFile(node.name);

  return (
    <div
      key={node.path}
      style={{ marginLeft: '1rem' }}
      draggable={!isRenaming && enableInternalDragDrop}
      onDragStart={(e) => {
        if (isRenaming) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        onDragStart(e, node);
      }}>

      <div
        className={`file-node ${selectedFileId === node.id ? 'selected' : ''}
                    ${isDragOver && node.type === 'directory' ? 'drag-over' : ''}
                    ${hasViewer ? 'has-viewer' : ''}`}
        onClick={() =>
          !isRenaming && (
            node.type === 'directory' ?
              onToggleFolder(node.path) :
              onFileSelect(node))
        }
        onDragOver={(e) => {
          if (node.type === 'directory') {
            const isFileDrop = Array.from(e.dataTransfer.items).some(
              (item) => item.kind === 'file'
            );
            const isInternalDrop = e.dataTransfer.getData('text/plain');

            if (
              isFileDrop && !enableFileSystemDragDrop ||
              isInternalDrop && !enableInternalDragDrop) {
              return;
            }

            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = isFileDrop ? 'copy' : 'move';
            onSetDragOverTarget(node.id);
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          onSetDragOverTarget(null);
        }}
        onDrop={(e) => {
          if (node.type === 'directory') {
            e.stopPropagation();
            onDropOnDirectory(e, node);
            onSetDragOverTarget(null);
          }
        }}>

        <span className={`file-icon ${isTemporaryFile(node.path) ? 'temp-file-icon' : ''}`}>
          {node.type === 'directory' ?
            <FolderIcon isOpen={isExpanded} /> :
            (() => {
              if (hasDocument) {
                return <FileTextIcon />;
              }
              const ViewerIcon = getViewerIcon(node);
              if (ViewerIcon) {
                return <ViewerIcon />;
              }
              return node.isBinary ?
                <UnknownFileIcon /> :

                <FileIcon />;

            })()}
        </span>

        {isRenaming ?
          <div className="file-name-input-container">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => onSetRenameValue(e.target.value)}
              onBlur={() => onSaveRename(node)}
              onKeyDown={(e) => onRenameKeyDown(e, node)}
              onClick={(e) => e.stopPropagation()}
              className="file-name-input" />

            <button
              className="cancel-input-button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelRename();
              }}
              title={t('Cancel')}>

              ×
            </button>
          </div> :

          <span className="file-name">
            {node.name}
            {hasDocument && <span className="file-linked-indicator">•</span>}
            {hasViewer &&
              <span className="file-viewer-indicator" title={t('Has viewer plugin')}>
                {/*👁️*/}
              </span>
            }
          </span>
        }

        <div className="file-actions">
          {shouldShowLinkButton && (
            !hasDocument ?
              <button
                className="action-btn"
                title={
                  isTemporaryFile(node.path) ?
                    'Link Document (Not recommended for temporary files)' :
                    'Link Document'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkToDocument(node.id);
                }}>

                <LinkIcon />
                {isTemporaryFile(node.path) &&
                  <span className="warning-indicator">{t('\u26A0\uFE0F')}</span>
                }
              </button> :

              <button
                className="action-btn"
                title={t('Unlink Document')}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnlinkFromDocument(node.id);
                }}>

                <UnlinkIcon />
              </button>)
          }

          <div
            className="action-menu"
            ref={(el) => {
              if (el) {
                menuRefs.current.set(node.id, el);
              } else {
                menuRefs.current.delete(node.id);
              }
            }}>

            <button
              className="action-btn menu-trigger"
              title={t('Options')}
              onClick={(e) => {
                e.stopPropagation();
                onSetActiveMenu(activeMenu === node.id ? null : node.id);
              }}>

              <MoreIcon />
            </button>
            <DropdownMenu
              targetRef={
                menuRefs.current.get(node.id) ?
                  { current: menuRefs.current.get(node.id)! } :
                  { current: null }
              }
              isOpen={activeMenu === node.id}
              onClose={() => onSetActiveMenu(null)}>

              <button
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename(node);
                }}>

                <EditIcon />
                <span>{t('Rename')}</span>
              </button>

              {enableInternalDragDrop &&
                <button
                  className="dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveFile(node);
                  }}>

                  <MoveIcon />
                  <span>{t('Move')}</span>
                </button>
              }

              {node.type === 'file' &&
                <>
                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateFile(node);
                    }}>

                    <DuplicateIcon />
                    <span>{t('Duplicate')}</span>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyPath(node);
                    }}>

                    <CopyUrlIcon />
                    <span>{t('Copy Path')}</span>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportFile(node);
                    }}>

                    <DownloadIcon />
                    <span>{t('Download')}</span>
                  </button>
                </>
              }

              {node.type === 'directory' &&
                <>
                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUploadToFolder(node.path);
                    }}>

                    <UploadIcon />
                    <span>{t('Upload Files')}</span>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateFileInFolder(node.id, node.path);
                    }}>

                    <FilePlusIcon />
                    <span>{t('New File')}</span>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSubfolder(node.path);
                    }}>

                    <FolderPlusIcon />
                    <span>{t('New Folder')}</span>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpandAllSubfolders(node);
                    }}>

                    <FolderOpenIcon />
                    <span>{t('Expand All')}</span>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCollapseAllSubfolders(node);
                    }}>

                    <FolderIcon />
                    <span>{t('Collapse All')}</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportFolder(node);
                    }}>

                    <DownloadIcon />
                    <span>{t('Download as ZIP')}</span>
                  </button>
                </>
              }

              <button
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowProperties(node);
                }}>

                <InfoIcon />
                <span>{t('Properties')}</span>
              </button>

              <button
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFileOrDirectory(node.id);
                }}>

                <TrashIcon />
                <span>{t('Delete')}</span>
              </button>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {node.type === 'directory' && isExpanded &&
        <div className="directory-children">
          {creatingNewItem && creatingNewItem.parentPath === node.path &&
            <div
              className="file-node creating-new-item"
              style={{ marginLeft: '1rem' }}>

              <span className="file-icon">
                {creatingNewItem.type === 'directory' ?
                  <FolderPlusIcon /> :

                  <FilePlusIcon />
                }
              </span>
              <div className="file-name-input-container">
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => onSetNewItemName(e.target.value)}
                  onBlur={onConfirmNewItem}
                  onKeyDown={onNewItemKeyDown}
                  className="file-name-input" />

                <button
                  className="cancel-input-button"
                  onClick={onCancelNewItem}
                  title={t('Cancel')}>

                  ×
                </button>
              </div>
            </div>
          }

          {node.children?.map((child) =>
            <FileTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              selectedFileId={selectedFileId}
              expandedFolders={expandedFolders}
              renamingFileId={renamingFileId}
              renameValue={renameValue}
              activeMenu={activeMenu}
              dragOverTarget={dragOverTarget}
              enableFileSystemDragDrop={enableFileSystemDragDrop}
              enableInternalDragDrop={enableInternalDragDrop}
              creatingNewItem={creatingNewItem}
              newItemName={newItemName}
              onFileSelect={onFileSelect}
              onToggleFolder={onToggleFolder}
              onStartRename={onStartRename}
              onSaveRename={onSaveRename}
              onCancelRename={onCancelRename}
              onRenameKeyDown={onRenameKeyDown}
              onSetRenameValue={onSetRenameValue}
              onSetActiveMenu={onSetActiveMenu}
              onLinkToDocument={onLinkToDocument}
              onUnlinkFromDocument={onUnlinkFromDocument}
              onMoveFile={onMoveFile}
              onDuplicateFile={onDuplicateFile}
              onCopyPath={onCopyPath}
              onExportFile={onExportFile}
              onShowProperties={onShowProperties}
              onExportFolder={onExportFolder}
              onCreateFileInFolder={onCreateFileInFolder}
              onCreateSubfolder={onCreateSubfolder}
              onUploadToFolder={onUploadToFolder}
              onExpandAllSubfolders={onExpandAllSubfolders}
              onCollapseAllSubfolders={onCollapseAllSubfolders}
              onDeleteFileOrDirectory={onDeleteFileOrDirectory}
              onDragStart={onDragStart}
              onDropOnDirectory={onDropOnDirectory}
              onSetDragOverTarget={onSetDragOverTarget}
              onSetNewItemName={onSetNewItemName}
              onConfirmNewItem={onConfirmNewItem}
              onCancelNewItem={onCancelNewItem}
              onNewItemKeyDown={onNewItemKeyDown}
              menuRefs={menuRefs} />

          )}
        </div>
      }
    </div>);

};

export default FileTreeItem;