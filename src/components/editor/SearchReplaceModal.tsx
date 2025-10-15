// src/components/editor/SearchReplaceModal.tsx
import type React from 'react';
import Modal from '../common/Modal';
import { ReplaceIcon } from '../common/Icons';

interface SearchReplaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    replaceCount: number;
    replaceType: 'file' | 'document' | 'all';
    fileName?: string;
}

const SearchReplaceModal: React.FC<SearchReplaceModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    replaceCount,
    replaceType,
    fileName,
}) => {
    const getTitle = () => {
        switch (replaceType) {
            case 'file':
                return 'Replace in File';
            case 'document':
                return 'Replace in Document';
            case 'all':
                return 'Replace All';
        }
    };

    const getMessage = () => {
        switch (replaceType) {
            case 'file':
                return `Replace ${replaceCount} occurrence${replaceCount !== 1 ? 's' : ''} in "${fileName}"?`;
            case 'document':
                return `Replace ${replaceCount} occurrence${replaceCount !== 1 ? 's' : ''} in document "${fileName}"?`;
            case 'all':
                return `Replace all occurrences in ${replaceCount} file${replaceCount !== 1 ? 's' : ''}?`;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={getTitle()}
            size="medium"
            icon={ReplaceIcon}
        >
            <div className="search-replace-modal-content">
                <p>{getMessage()}</p>

                <div className="warning-message">
                    This action cannot be undone.
                </div>

                <div className="modal-actions">
                    <button
                        type="button"
                        className="button secondary"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="button primary"
                        onClick={onConfirm}
                    >
                        Replace
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SearchReplaceModal;