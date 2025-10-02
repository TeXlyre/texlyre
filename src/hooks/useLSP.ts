// src/hooks/useLSP.ts
import { useContext } from 'react';
import { LSPContext } from '../contexts/LSPContext';

export const useLSP = () => {
	const context = useContext(LSPContext);
	if (!context) {
		throw new Error('useLSP must be used within an LSPProvider');
	}
	return context;
};