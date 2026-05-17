// src/hooks/useRecords.ts
import { useContext } from 'react';

import { RecordsContext } from '../contexts/RecordsContext';

export const useRecords = () => {
    const context = useContext(RecordsContext);
    if (!context) {
        throw new Error('useRecords must be used within a RecordsProvider');
    }
    return context;
};
