// src/hooks/useSourceMap.ts
import { useContext } from 'react';

import { SourceMapContext } from '../contexts/SourceMapContext';

export const useSourceMap = () => {
    const context = useContext(SourceMapContext);
    if (!context) {
        throw new Error('useSourceMap must be used within a SourceMapProvider');
    }
    return context;
};