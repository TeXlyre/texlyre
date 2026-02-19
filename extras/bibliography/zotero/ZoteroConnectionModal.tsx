// extras/bibliography/zotero/ZoteroConnectionModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState, useEffect } from 'react';

import Modal from '@/components/common/Modal';
import { ZoteroIcon } from './Icon';
import { zoteroAPIService } from './ZoteroAPIService';
import './styles.css';

interface ZoteroConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (apiKey: string, userId: string, libraryId: string, libraryType: 'user' | 'group') => Promise<void>;
    existingApiKey?: string;
    existingUserId?: string;
}

const ZoteroConnectionModal: React.FC<ZoteroConnectionModalProps> = ({
    isOpen,
    onClose,
    onConnect,
    existingApiKey,
    existingUserId
}) => {
    const [step, setStep] = useState<'credentials' | 'library'>('credentials');
    const [apiKey, setApiKey] = useState('');
    const [userId, setUserId] = useState('');
    const [libraries, setLibraries] = useState<Array<{ id: string; name: string; type: 'user' | 'group' }>>([]);
    const [selectedLibrary, setSelectedLibrary] = useState('');
    const [selectedLibraryType, setSelectedLibraryType] = useState<'user' | 'group'>('user');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (existingApiKey && existingUserId) {
                setApiKey(existingApiKey);
                setUserId(existingUserId);
                setStep('library');
                void loadLibraries(existingApiKey, existingUserId);
            } else {
                setStep('credentials');
                setApiKey('');
                setUserId('');
                setLibraries([]);
                setSelectedLibrary('');
                setError('');
            }
        }
    }, [isOpen, existingApiKey, existingUserId]);

    const loadLibraries = async (key: string, uid: string) => {
        setIsLoading(true);
        setError('');
        try {
            const libs = await zoteroAPIService.getUserLibraries(key, uid);
            setLibraries(libs);
            if (libs.length > 0) {
                setSelectedLibrary(libs[0].id);
                setSelectedLibraryType(libs[0].type);
            }
        } catch (err) {
            setError('Failed to load libraries');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCredentialsSubmit = async () => {
        if (!apiKey.trim() || !userId.trim()) {
            setError('API key and User ID are required');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const isValid = await zoteroAPIService.testConnection(apiKey, userId);
            if (!isValid) {
                setError('Invalid API key or User ID');
                return;
            }

            await loadLibraries(apiKey, userId);
            setStep('library');
        } catch (err) {
            setError('Connection failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLibrarySubmit = async () => {
        if (!selectedLibrary) {
            setError('Please select a library');
            return;
        }

        setIsLoading(true);
        try {
            await onConnect(apiKey, userId, selectedLibrary, selectedLibraryType);
            onClose();
        } catch (err) {
            setError('Connection failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLibraryChange = (libraryId: string) => {
        setSelectedLibrary(libraryId);
        const library = libraries.find(lib => lib.id === libraryId);
        if (library) {
            setSelectedLibraryType(library.type);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('Connect to Zotero')}
            icon={ZoteroIcon}
            size="medium"
        >
            <div className="zotero-connection-modal">
                {step === 'credentials' && (
                    <div className="zotero-connection-step">
                        <p className="zotero-step-description">
                            {t('Enter your Zotero API credentials. You can find these in your Zotero account settings.')}
                        </p>

                        <div className="form-group">
                            <label>{t('API Key:')}</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={t('Enter your Zotero API key')}
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-group">
                            <label>{t('User ID:')}</label>
                            <input
                                type="text"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                placeholder={t('Enter your Zotero User ID')}
                                disabled={isLoading}
                            />
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <div className="button-group zotero-button-group">
                            <button
                                className="button primary"
                                onClick={handleCredentialsSubmit}
                                disabled={isLoading || !apiKey.trim() || !userId.trim()}
                            >
                                {isLoading ? t('Connecting...') : t('Connect')}
                            </button>
                            <button className="button secondary" onClick={onClose}>
                                {t('Cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'library' && (
                    <div className="zotero-connection-step">
                        <p className="zotero-step-description">
                            {t('Select a Zotero library to use for this project.')}
                        </p>

                        <div className="form-group">
                            <label>{t('Library:')}</label>
                            <select
                                value={selectedLibrary}
                                onChange={(e) => handleLibraryChange(e.target.value)}
                                disabled={isLoading}
                            >
                                <option value="">{t('Select a library...')}</option>
                                {libraries.map((lib) => (
                                    <option key={lib.id} value={lib.id}>
                                        {lib.name} ({lib.type === 'user' ? t('Personal') : t('Group')})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <div className="button-group zotero-button-group">
                            <button
                                className="button primary"
                                onClick={handleLibrarySubmit}
                                disabled={isLoading || !selectedLibrary}
                            >
                                {isLoading ? t('Connecting...') : t('Connect')}
                            </button>
                            <button
                                className="button secondary"
                                onClick={() => setStep('credentials')}
                                disabled={isLoading}
                            >
                                {t('Back')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ZoteroConnectionModal;