// src/components/editor/UnlinkedDocumentNotice.tsx
import type React from "react";
import { useState } from "react";

import { LinkIcon, TrashIcon } from "../common/Icons";
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

  const handleDeleteDocument = () => {
    if (confirm(`Are you sure you want to delete the document "${documentName}"?`)) {
      onDeleteDocument(documentId);
    }
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
            onClick={handleDeleteDocument}
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
    </>
  );
};

export default UnlinkedDocumentNotice;