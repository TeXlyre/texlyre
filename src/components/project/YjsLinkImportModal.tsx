// src/components/project/YjsLinkImportModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';
import { ShareIcon } from '../common/Icons';
import Modal from '../common/Modal';
import { isValidYjsUrl } from '../../utils/urlUtils';

interface YjsLinkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onYjsLinkOpen: (yjsUrl: string) => void;
}

const YjsLinkImportModal: React.FC<YjsLinkImportModalProps> = ({
    isOpen,
    onClose,
    onYjsLinkOpen
}) => {
    const [yjsInput, setYjsInput] = useState('');
    const [error, setError] = useState<string | null>(null);

    const normalizeYjsInput = (input: string): string | null => {
        const trimmed = input.trim();

        if (isValidYjsUrl(trimmed)) {
            return trimmed;
        }

        if (trimmed.includes('#')) {
            const hashIndex = trimmed.indexOf('#');
            const afterHash = trimmed.substring(hashIndex + 1);
            if (isValidYjsUrl(afterHash)) {
                return afterHash;
            }
        }

        if (trimmed.startsWith('#')) {
            const withoutHash = trimmed.substring(1);
            if (isValidYjsUrl(withoutHash)) {
                return withoutHash;
            }
        }

        if (!trimmed.startsWith('yjs:')) {
            const withPrefix = `yjs:${trimmed}`;
            if (isValidYjsUrl(withPrefix)) {
                return withPrefix;
            }
        }

        return null;
    };

    const handleOpen = () => {
        setError(null);

        if (!yjsInput.trim()) {
            setError(t('Please enter a TeXlyre link'));
            return;
        }

        const normalized = normalizeYjsInput(yjsInput);

        if (!normalized) {
            setError(t('Invalid TeXlyre link format'));
            return;
        }

        onYjsLinkOpen(normalized);
        handleClose();
    };

    const handleClose = () => {
        setYjsInput('');
        setError(null);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={t('Open TeXlyre Link')}
            icon={ShareIcon}
            size="medium">
            <div className="yjs-link-import-modal">
                {error && (
                    <div className="error-message" style={{ marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                <div className="form-group">
                    <label htmlFor="yjs-link-input">{t('TeXlyre Link')}</label>
                    <p className="field-description">
                        {t('Enter the full TeXlyre link, partial link, or just the YJS ID')}
                    </p>
                    <input
                        type="text"
                        id="yjs-link-input"
                        value={yjsInput}
                        onChange={(e) => setYjsInput(e.target.value)}
                        placeholder="yjs:abc123... or abc123..."
                        onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
                        autoFocus
                    />
                    <small>
                        {t('Examples: yjs:abc123, #yjs:abc123, or just abc123')}
                    </small>
                </div>

                <div className="info-message">
                    <p>
                        {t('This will open the shared project associated with this TeXlyre link. The project owner must be online to sync data via peer-to-peer connection.')}
                    </p>
                </div>
            </div>

            <div className="modal-actions">
                <button
                    type="button"
                    className="button secondary"
                    onClick={handleClose}>
                    {t('Cancel')}
                </button>
                <button
                    type="button"
                    className="button primary"
                    onClick={handleOpen}
                    disabled={!yjsInput.trim()}>
                    <ShareIcon />
                    {t('Open Project')}
                </button>
            </div>
        </Modal>
    );
};

export default YjsLinkImportModal;