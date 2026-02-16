import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { BibliographyPanelProps } from '@/plugins/PluginInterface';
import { useSecrets } from '@/hooks/useSecrets';
import { useProperties } from '@/hooks/useProperties';
import { zoteroService } from './ZoteroService';
import ZoteroConnectionModal from './ZoteroConnectionModal';

const ZoteroPanel: React.FC<BibliographyPanelProps> = ({ className = '' }) => {
    const secrets = useSecrets();
    const properties = useProperties();
    const [showModal, setShowModal] = useState(false);
    const [existingCredentials, setExistingCredentials] = useState<{ apiKey: string; userId: string } | null>(null);
    const [connectionStatus, setConnectionStatus] = useState(zoteroService.getConnectionStatus());

    useEffect(() => {
        zoteroService.setSecretsContext(secrets);
        zoteroService.setPropertiesContext(properties);
    }, [secrets, properties]);

    useEffect(() => {
        const unsubscribe = zoteroService.addStatusListener(setConnectionStatus);
        return unsubscribe;
    }, []);

    useEffect(() => {
        const checkCredentials = async () => {
            const creds = await zoteroService.getStoredCredentials();
            setExistingCredentials(creds);
        };
        checkCredentials();
    }, []);

    const getCurrentProjectId = (): string | undefined => {
        const urlHash = window.location.hash.substring(1);
        const fragments = urlHash.split('/');
        const yjsFragment = fragments.find(f => f.startsWith('yjs='));
        return yjsFragment ? yjsFragment.slice(4) : undefined;
    };

    const handleConnect = async (apiKey: string, userId: string, libraryId: string, libraryType: 'user' | 'group') => {
        const projectId = getCurrentProjectId();
        await zoteroService.connect(apiKey, userId, libraryId, libraryType, projectId);
        const creds = await zoteroService.getStoredCredentials();
        setExistingCredentials(creds);
    };

    const handleDisconnect = async () => {
        const projectId = getCurrentProjectId();
        await zoteroService.disconnect(projectId);
    };

    const handleChangeLibrary = () => {
        setShowModal(true);
    };

    return (
        <div className={`zotero-panel ${className}`}>
            <div className="zotero-connection-info">
                {connectionStatus === 'disconnected' && (
                    <div className="zotero-not-connected">
                        <p>{t('Connect to your Zotero library to access your bibliography.')}</p>
                        <button
                            className="button primary"
                            onClick={() => setShowModal(true)}
                        >
                            {t('Connect to Zotero')}
                        </button>
                    </div>
                )}

                {connectionStatus === 'connected' && (
                    <div className="zotero-connected">
                        <p className="connection-status">
                            <span className="status-indicator connected">●</span>
                            {t('Connected to Zotero')}
                        </p>
                        <div className="button-group">
                            <button
                                className="button secondary"
                                onClick={handleChangeLibrary}
                            >
                                {t('Change Library')}
                            </button>
                            <button
                                className="button secondary"
                                onClick={handleDisconnect}
                            >
                                {t('Disconnect')}
                            </button>
                        </div>
                    </div>
                )}

                {connectionStatus === 'connecting' && (
                    <div className="zotero-connecting">
                        <p>{t('Connecting to Zotero...')}</p>
                    </div>
                )}

                {connectionStatus === 'error' && (
                    <div className="zotero-error">
                        <p className="error-message">{t('Failed to connect to Zotero. Please check your credentials.')}</p>
                        <button
                            className="button primary"
                            onClick={() => setShowModal(true)}
                        >
                            {t('Reconnect')}
                        </button>
                    </div>
                )}
            </div>

            <ZoteroConnectionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onConnect={handleConnect}
                existingApiKey={existingCredentials?.apiKey}
                existingUserId={existingCredentials?.userId}
            />
        </div>
    );
};

export default ZoteroPanel;