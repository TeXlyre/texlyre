// src/components/editor/UnlinkedDocumentNotice.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useState } from 'react';

import { LinkIcon, TrashIcon } from '../common/Icons';
import Modal from '../common/Modal';
import LinkFileModal from './LinkFileModal';

interface UnlinkedDocumentNoticeProps {
  documentId: string;
  documentName: string;
  onDeleteDocument: (docId: string) => void;
  onDocumentLinked: () => void;
  projectType?: 'latex' | 'typst';
}

const UnlinkedDocumentNotice: React.FC<UnlinkedDocumentNoticeProps> = ({
  documentId,
  documentName,
  onDeleteDocument,
  onDocumentLinked,
  projectType = 'latex'
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
				<span>{t('This document is not linked to any file. You can link it to a new file or delete it.')}


        </span>
				<div className="unlinked-document-actions">
					<button
            className="link-button"
            onClick={() => setShowLinkModal(true)}
            title={t('Link to new file')}>

						<LinkIcon />{t('Link to file')}

          </button>
					<button
            className="link-button delete-action"
            onClick={() => setShowDeleteDialog(true)}
            title={t('Delete document')}>

						<TrashIcon />{t('Delete')}

          </button>
				</div>
			</div>

			{showLinkModal &&
      <LinkFileModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        documentId={documentId}
        documentName={documentName}
        projectType={projectType}
        onLinked={() => {
          setShowLinkModal(false);
          onDocumentLinked();
        }} />

      }

			{showDeleteDialog &&
      <Modal
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title={t('Delete Document')}
        size="medium">

					<div className="delete-document-content">
						<p>{t('Are you sure you want to delete the document "')}
            {documentName}{t('"?')}
          </p>

						<div className="warning-message">{t('This action cannot be undone. The document will be permanently removed.')}


          </div>

						<div className="modal-actions">
							<button
              type="button"
              className="button secondary"
              onClick={() => setShowDeleteDialog(false)}>{t('Cancel')}


            </button>
							<button
              type="button"
              className="button danger"
              onClick={handleDeleteDocument}>{t('Delete Document')}


            </button>
						</div>
					</div>
				</Modal>
      }
		</>);

};

export default UnlinkedDocumentNotice;