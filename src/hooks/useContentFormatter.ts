// src/hooks/useContentFormatter.ts
import { useContext } from 'react';
import { ContentFormatterContext } from '../contexts/ContentFormatterContext';

export const useContentFormatter = () => {
    const context = useContext(ContentFormatterContext);
    if (!context) {
        throw new Error('useContentFormatter must be used within a ContentFormatterProvider');
    }
    return context;
};