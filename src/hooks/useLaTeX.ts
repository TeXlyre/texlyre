// src/hooks/useLaTeX.ts
import { useContext } from 'react';

import { LaTeXContext } from '../contexts/LaTeXContext';

export const useLaTeX = () => {
	const context = useContext(LaTeXContext);
	if (!context) {
		throw new Error('useLaTeX must be used within a LaTeXProvider');
	}
	return context;
};
