// src/hooks/useUrlMetadata.ts
import { t } from '@/i18n'
import { useState, useEffect } from 'react';
import { fetchPageMetadata } from '../utils/urlMetadataExtractor';

export const usePageMetadata = (url: string | null, proxyUrl: string | null = null) => {
    const [metadata, setMetadata] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!url) {
            setMetadata(null);
            setError(null);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const data = await fetchPageMetadata(url, proxyUrl);
                setMetadata(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : t('Failed to fetch metadata'));
                setMetadata(null);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [url, proxyUrl]);

    return { metadata, loading, error };
};