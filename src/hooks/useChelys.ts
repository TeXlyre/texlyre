// src/hooks/useChelys.ts
import { useContext } from 'react';

import { ChelysContext } from '../contexts/ChelysContext';

export const useChelys = () => {
	const context = useContext(ChelysContext);
	if (!context) {
		throw new Error('useChelys must be used within an ChelysProvider');
	}
	return context;
};
