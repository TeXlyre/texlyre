// extras/bibliography/openalex/OpenAlexPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import type { BibliographyPanelProps } from '@/plugins/PluginInterface';
import { useSecrets } from '@/hooks/useSecrets';
import { DisconnectIcon } from '@/components/common/Icons';
import { openAlexService } from './OpenAlexService';
import { WORK_TYPES } from './OpenAlexAPIService';
import type { OpenAlexFilters } from './OpenAlexAPIService';
import OpenAlexConnectionModal from './OpenAlexConnectionModal';
import './styles.css';

export interface OpenAlexPanelState {
    filters: OpenAlexFilters;
}

const OpenAlexPanel: React.FC<BibliographyPanelProps> = ({ className = '', onFiltersChange }) => {
    const secrets = useSecrets();
    const [showModal, setShowModal] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState(openAlexService.getConnectionStatus());
    const [existingEmail, setExistingEmail] = useState<string | undefined>();
    const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
    const [filters, setFilters] = useState<OpenAlexFilters>({});

    useEffect(() => {
        openAlexService.setSecretsContext(secrets);
    }, [secrets]);

    useEffect(() => {
        const unsubscribe = openAlexService.addStatusListener(setConnectionStatus);
        return unsubscribe;
    }, []);

    useEffect(() => {
        const checkAndConnect = async () => {
            const creds = await openAlexService.getStoredCredentials();
            if (creds) {
                setExistingEmail(creds.email);
                setHasExistingApiKey(!!creds.apiKey);
                await openAlexService.autoConnect();
            }
        };
        checkAndConnect();
    }, []);

    const handleConnect = async (apiKey?: string, email?: string) => {
        await openAlexService.connect(apiKey, email);
        const creds = await openAlexService.getStoredCredentials();
        setExistingEmail(creds?.email);
        setHasExistingApiKey(!!creds?.apiKey);
    };

    const handleDisconnect = async () => {
        await openAlexService.disconnect();
        setExistingEmail(undefined);
        setHasExistingApiKey(false);
    };

    const updateFilter = <K extends keyof OpenAlexFilters>(key: K, value: OpenAlexFilters[K]) => {
        const next = { ...filters, [key]: value };
        if (value === '' || value === undefined || value === false && key !== 'isOA') {
            delete next[key];
        }
        setFilters(next);
        onFiltersChange?.(next);
    };

    const clearFilters = () => {
        setFilters({});
        onFiltersChange?.({});
    };

    const hasFilters = Object.keys(filters).length > 0;

    return (
        <div className={`openalex-panel ${className}`}>
            {connectionStatus === 'disconnected' && (
                <div className="openalex-not-connected">
                    <p>{t('Connect to OpenAlex to search 250M+ scholarly works.')}</p>
                    <button className="button primary" onClick={() => setShowModal(true)}>
                        {t('Connect to OpenAlex')}
                    </button>
                </div>
            )}

            {connectionStatus === 'connecting' && (
                <div className="openalex-connecting">
                    <p>{t('Connecting to OpenAlex...')}</p>
                </div>
            )}

            {connectionStatus === 'error' && (
                <div className="openalex-error">
                    <p className="error-message">{t('Failed to connect to OpenAlex.')}</p>
                    <div className="backup-toolbar">
                        <div className="primary-actions">
                            <button className="button primary" onClick={() => setShowModal(true)}>
                                {t('Reconnect')}
                            </button>
                        </div>
                        <div className="secondary-actions">
                            <button
                                className="button secondary icon-only"
                                onClick={handleDisconnect}
                                title={t('Disconnect')}>
                                <DisconnectIcon />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {connectionStatus === 'connected' && (
                <div className="openalex-connected">
                    <div className="backup-toolbar">
                        <div className="primary-actions">
                            <button
                                className="button secondary icon-only"
                                onClick={() => setShowModal(true)}
                                title={t('Edit credentials')}>
                                {t('API')}
                            </button>
                        </div>
                        <div className="secondary-actions">
                            <button
                                className="button secondary icon-only"
                                onClick={handleDisconnect}
                                title={t('Disconnect')}>
                                <DisconnectIcon />
                            </button>
                        </div>
                    </div>

                    <div className="openalex-filters">
                        <div className="openalex-filters-header">
                            <span className="openalex-filters-label">{t('Filters')}</span>
                            {hasFilters && (
                                <button className="openalex-clear-filters" onClick={clearFilters}>
                                    {t('Clear')}
                                </button>
                            )}
                        </div>

                        <div className="openalex-filter-row">
                            <label>{t('Type')}</label>
                            <select
                                value={filters.type || ''}
                                onChange={e => updateFilter('type', e.target.value || undefined)}
                                className="openalex-filter-select"
                            >
                                <option value="">{t('Any type')}</option>
                                {WORK_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div className="openalex-filter-row">
                            <label>{t('Year')}</label>
                            <div className="openalex-year-range">
                                <input
                                    type="number"
                                    placeholder={t('From')}
                                    min={1000}
                                    max={new Date().getFullYear()}
                                    value={filters.yearFrom || ''}
                                    onChange={e => updateFilter('yearFrom', e.target.value ? Number(e.target.value) : undefined)}
                                    className="openalex-year-input"
                                />
                                <span>–</span>
                                <input
                                    type="number"
                                    placeholder={t('To')}
                                    min={1000}
                                    max={new Date().getFullYear()}
                                    value={filters.yearTo || ''}
                                    onChange={e => updateFilter('yearTo', e.target.value ? Number(e.target.value) : undefined)}
                                    className="openalex-year-input"
                                />
                            </div>
                        </div>

                        <div className="openalex-filter-row">
                            <label>{t('Open Access')}</label>
                            <select
                                value={filters.isOA === undefined ? '' : String(filters.isOA)}
                                onChange={e => updateFilter('isOA', e.target.value === '' ? undefined : e.target.value === 'true')}
                                className="openalex-filter-select"
                            >
                                <option value="">{t('Any')}</option>
                                <option value="true">{t('Open Access only')}</option>
                                <option value="false">{t('Not Open Access')}</option>
                            </select>
                        </div>

                        <div className="openalex-filter-row">
                            <label>{t('Has DOI')}</label>
                            <select
                                value={filters.hasDoi === undefined ? '' : String(filters.hasDoi)}
                                onChange={e => updateFilter('hasDoi', e.target.value === '' ? undefined : e.target.value === 'true')}
                                className="openalex-filter-select"
                            >
                                <option value="">{t('Any')}</option>
                                <option value="true">{t('Yes')}</option>
                                <option value="false">{t('No')}</option>
                            </select>
                        </div>

                        <div className="openalex-filter-row">
                            <label>{t('Min. Citations')}</label>
                            <input
                                type="number"
                                min={0}
                                placeholder="0"
                                value={filters.minCitations || ''}
                                onChange={e => updateFilter('minCitations', e.target.value ? Number(e.target.value) : undefined)}
                                className="openalex-filter-input"
                            />
                        </div>
                    </div>
                </div>
            )}

            <OpenAlexConnectionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onConnect={handleConnect}
                existingEmail={existingEmail}
                hasExistingApiKey={hasExistingApiKey}
            />
        </div>
    );
};

export default OpenAlexPanel;
