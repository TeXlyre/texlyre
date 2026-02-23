// extras/bibliography/openalex/OpenAlexConnectionModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState, useEffect } from 'react';

import Modal from '@/components/common/Modal';
import { OpenAlexIcon } from './Icon';
import { openAlexAPIService } from './OpenAlexAPIService';
import './styles.css';

interface OpenAlexConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (apiKey?: string, email?: string) => Promise<void>;
    existingEmail?: string;
    hasExistingApiKey?: boolean;
}

const OpenAlexConnectionModal: React.FC<OpenAlexConnectionModalProps> = ({
    isOpen,
    onClose,
    onConnect,
    existingEmail,
    hasExistingApiKey,
}) => {
    const [apiKey, setApiKey] = useState('');
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setApiKey('');
            setEmail(existingEmail || '');
            setError('');
        }
    }, [isOpen, existingEmail]);

    const handleSubmit = async () => {
        setIsTesting(true);
        setError('');
        try {
            const isValid = await openAlexAPIService.testConnection(
                apiKey.trim() || undefined,
                email.trim() || undefined
            );
            if (!isValid) {
                setError(t('Could not reach OpenAlex API. Please check your connection.'));
                return;
            }
        } catch {
            setError(t('Connection test failed.'));
            return;
        } finally {
            setIsTesting(false);
        }

        setIsLoading(true);
        try {
            await onConnect(apiKey.trim() || undefined, email.trim() || undefined);
            onClose();
        } catch {
            setError(t('Failed to save credentials.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnectAnonymously = async () => {
        setIsTesting(true);
        setError('');
        try {
            const isValid = await openAlexAPIService.testConnection(undefined, undefined);
            if (!isValid) {
                setError(t('Could not reach OpenAlex API.'));
                return;
            }
        } catch {
            setError(t('Connection test failed.'));
            return;
        } finally {
            setIsTesting(false);
        }

        setIsLoading(true);
        try {
            await onConnect(undefined, undefined);
            onClose();
        } catch {
            setError(t('Connection failed.'));
        } finally {
            setIsLoading(false);
        }
    };

    const busy = isLoading || isTesting;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('Connect to OpenAlex')}
            icon={OpenAlexIcon}
            size="medium"
        >
            <div className="openalex-connection-modal">
                <p className="openalex-step-description">
                    {t('OpenAlex is free and works without an API key. Providing an email enables the polite pool (higher rate limits). An API key is required for premium access.')}
                </p>

                <div className="form-group">
                    <label>{t('Email (recommended):')}</label>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder={t('your@email.com')}
                        disabled={busy}
                    />
                    <span className="openalex-field-hint">{t('Used as mailto parameter for polite pool access')}</span>
                </div>

                <div className="form-group">
                    <label>
                        {t('API Key')}
                        <span className="openalex-optional-badge">{t('optional')}</span>
                        {hasExistingApiKey && <span className="openalex-stored-badge">{t('stored')}</span>}
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder={hasExistingApiKey ? t('Leave blank to keep existing key') : t('Enter API key for premium access')}
                        disabled={busy}
                    />
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="button-group openalex-button-group">
                    <button
                        className="button primary"
                        onClick={handleSubmit}
                        disabled={busy}
                    >
                        {busy ? t('Connecting...') : t('Connect')}
                    </button>
                    {!hasExistingApiKey && (
                        <button
                            className="button secondary"
                            onClick={handleConnectAnonymously}
                            disabled={busy}
                        >
                            {t('Use Anonymously')}
                        </button>
                    )}
                    <button className="button secondary" onClick={onClose} disabled={busy}>
                        {t('Cancel')}
                    </button>
                </div>
                <br />
                <a
                    href="https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dropdown-link"
                >
                    {t('Learn more about OpenAlex API access')}
                </a>
            </div>
        </Modal>
    );
};

export default OpenAlexConnectionModal;
