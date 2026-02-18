import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import type { BibliographyPanelProps } from '@/plugins/PluginInterface';
import { useSecrets } from '@/hooks/useSecrets';
import { useProperties } from '@/hooks/useProperties';
import { GitBranchIcon, DisconnectIcon } from '@/components/common/Icons';
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
            if (creds) {
                const projectId = getCurrentProjectId();
                await zoteroService.autoConnect(projectId);
            }
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
        setExistingCredentials(null);
    };

    return (
        <div className={`zotero-panel ${className}`}>
            <div className="zotero-connection-info">
                {connectionStatus === 'disconnected' && (
                    <div className="zotero-not-connected">
                        <p>{t('Connect to your Zotero library to access your bibliography.')}</p>
                        <div className="backup-toolbar">
                            <div className="primary-actions" >
                                <button className="button primary" onClick={() => setShowModal(true)}>
                                    {t('Connect to Zotero')}
                                </button>
                            </div>
                            <div className="secondary-actions">
                                <button
                                    className="button secondary icon-only"
                                    onClick={handleDisconnect}
                                    title={t('Disconnect (deletes API key)')}>
                                    <DisconnectIcon />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {connectionStatus === 'connected' && (
                    <div className="zotero-connected">
                        <div className="backup-toolbar">
                            <div className="primary-actions" />
                            <div className="secondary-actions">
                                <button
                                    className="button secondary icon-only"
                                    onClick={() => setShowModal(true)}
                                    title={t('Change library')}>
                                    <GitBranchIcon />
                                </button>
                                <button
                                    className="button secondary icon-only"
                                    onClick={handleDisconnect}
                                    title={t('Disconnect (deletes API key)')}>
                                    <DisconnectIcon />
                                </button>
                            </div>
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
                        <button className="button primary" onClick={() => setShowModal(true)}>
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