// src/components/editor/SearchReplaceModal.tsx
import { t } from '@/i18n';
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
                return t('Replace in File');
            case 'document':
                return t('Replace in Document');
            case 'all':
                return t('Replace All');
        }
    };

    const getMessage = () => {
        switch (replaceType) {
            case 'file':
                return t('Replace {count} occurrence in "{fileName}"?', { count: replaceCount, fileName });
            case 'document':
                return t('Replace {count} occurrence in document "{fileName}"?', { count: replaceCount, fileName });
            case 'all':
                return t('Replace all occurrences in {count} file?', { count: replaceCount });
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
                    {t('This action cannot be undone.')}
                </div>

                <div className="modal-actions">
                    <button
                        type="button"
                        className="button secondary"
                        onClick={onClose}
                    >
                        {t('Cancel')}
                    </button>
                    <button
                        type="button"
                        className="button primary"
                        onClick={onConfirm}
                    >
                        {t('Replace')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SearchReplaceModal;