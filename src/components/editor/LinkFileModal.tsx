// src/components/editor/LinkFileModal.tsx
import type React from "react";
import { useState } from "react";

import { useFileTree } from "../../hooks/useFileTree";
import { fileStorageService } from "../../services/FileStorageService";
import type { FileNode } from "../../types/files";
import { isTemporaryFile } from "../../utils/fileUtils";
import { FolderIcon } from "../common/Icons";
import Modal from "../common/Modal";

interface LinkFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  onLinked: () => void;
}

const LinkFileModal: React.FC<LinkFileModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentName,
  onLinked,
}) => {
  const { fileTree, refreshFileTree } = useFileTree();
  const [selectedDirectory, setSelectedDirectory] = useState<string>("/");
  const [fileName, setFileName] = useState(() => {
    const baseName = documentName.replace(/[^a-zA-Z0-9_-]/g, "_");
    return baseName.endsWith(".tex") ? baseName : `${baseName}.tex`;
  });
  const [isCreating, setIsCreating] = useState(false);

  const getDirectoryOptions = (): FileNode[] => {
    const collectDirectories = (nodes: FileNode[]): FileNode[] => {
      let directories: FileNode[] = [];

      for (const node of nodes) {
        if (
          node.type === "directory" &&
          !isTemporaryFile(node.path)
        ) {
          directories.push(node);
          if (node.children) {
            directories = directories.concat(collectDirectories(node.children));
          }
        }
      }

      return directories;
    };

    return collectDirectories(fileTree);
  };

  const handleCreate = async () => {
    if (!fileName.trim()) return;

    setIsCreating(true);
    try {
      const filePath = selectedDirectory === "/" ? `/${fileName.trim()}` : `${selectedDirectory}/${fileName.trim()}`;

      const file = new File([""], fileName.trim(), { type: "text/plain" });
      await fileStorageService.createDirectoryPath(filePath);

      const fileNode: FileNode = {
        id: crypto.randomUUID(),
        name: fileName.trim(),
        path: filePath,
        type: "file",
        content: new ArrayBuffer(0),
        lastModified: Date.now(),
        size: 0,
        mimeType: "text/plain",
        isBinary: false,
        documentId: documentId,
      };

      await fileStorageService.storeFile(fileNode);
      await refreshFileTree();
      onLinked();
    } catch (error) {
      if (error instanceof Error && error.message === "File operation cancelled by user") {
        // User cancelled due to conflict
        return;
      }
      console.error("Error creating linked file:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link Document to New File" size="medium">
      <div className="link-file-modal-content">
        <p>Create a new file and link it to the document "{documentName}".</p>

        <div className="form-group">
          <label htmlFor="fileName">File name</label>
          <input
            type="text"
            id="fileName"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            disabled={isCreating}
            placeholder="Enter file name"
          />
        </div>

        <div className="form-group">
          <label>Select destination folder</label>
          <div className="directory-tree">
            <div
              className={`directory-option ${selectedDirectory === "/" ? "selected" : ""}`}
              onClick={() => setSelectedDirectory("/")}
            >
              <FolderIcon />
              <span>/</span>
            </div>

            {getDirectoryOptions().map((dir) => (
              <div
                key={dir.path}
                className={`directory-option ${selectedDirectory === dir.path ? "selected" : ""}`}
                onClick={() => setSelectedDirectory(dir.path)}
              >
                <FolderIcon />
                <span>{dir.path}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleCreate}
            disabled={isCreating || !fileName.trim()}
          >
            {isCreating ? "Creating..." : "Create & Link"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default LinkFileModal;