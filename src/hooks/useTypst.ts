// src/hooks/useTypst.ts
import { useContext } from 'react';
import { TypstContext } from '../contexts/TypstContext';
import { TypstContextType } from '../types/typst';

export const useTypst = (): TypstContextType => {
    const context = useContext(TypstContext);
    if (!context) {
        throw new Error('useTypst must be used within a TypstProvider');
    }
    return context;
};