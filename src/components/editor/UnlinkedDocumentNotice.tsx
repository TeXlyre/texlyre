// src/components/editor/UnlinkedDocumentNotice.tsx
import type React from "react";
import { useState } from "react";

import { LinkIcon, TrashIcon } from "../common/Icons";
import Modal from "../common/Modal";
import LinkFileModal from "./LinkFileModal";

interface UnlinkedDocumentNoticeProps {
  documentId: string;
  documentName: string;
  onDeleteDocument: (docId: string) => void;
  onDocumentLinked: () => void;
}

const UnlinkedDocumentNotice: React.FC<UnlinkedDocumentNoticeProps> = ({
  documentId,
  documentName,
  onDeleteDocument,
  onDocumentLinked,
}) => {
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDeleteDocument = () => {
    onDeleteDocument(documentId);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="unlinked-document-notice">
        <span>
          This document is not linked to any file. You can link it to a new file or delete it.
        </span>
        <div className="unlinked-document-actions">
          <button
            className="link-button"
            onClick={() => setShowLinkModal(true)}
            title="Link to new file"
          >
            <LinkIcon />
            Link to file
          </button>
          <button
            className="link-button delete-action"
            onClick={() => setShowDeleteDialog(true)}
            title="Delete document"
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      </div>

      {showLinkModal && (
        <LinkFileModal
          isOpen={showLinkModal}
          onClose={() => setShowLinkModal(false)}
          documentId={documentId}
          documentName={documentName}
          onLinked={() => {
            setShowLinkModal(false);
            onDocumentLinked();
          }}
        />
      )}

      {showDeleteDialog && (
        <Modal
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          title="Delete Document"
          size="medium"
        >
          <div className="delete-document-content">
            <p>
              Are you sure you want to delete the document "{documentName}"?
            </p>

            <div className="warning-message">
              This action cannot be undone. The document will be permanently removed.
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowDeleteDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleDeleteDocument}
              >
                Delete Document
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default UnlinkedDocumentNotice;