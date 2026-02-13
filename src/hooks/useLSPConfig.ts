// src/hooks/useLSPConfigs.ts
import { useContext } from 'react';
import { LSPConfigContext } from '../contexts/LSPConfigContext';

export const useLSPConfig = () => {
    const context = useContext(LSPConfigContext);
    if (!context) {
        throw new Error('useLSPConfig must be used within LSPConfigProvider');
    }
    return context;
};