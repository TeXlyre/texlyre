// src/hooks/useExternalCompiler.ts
import { useContext } from 'react';

import { ExternalCompilerContext } from '../contexts/ExternalCompilerContext';

export const useExternalCompiler = () => {
	const context = useContext(ExternalCompilerContext);
	if (!context) {
		throw new Error(
			'useExternalCompiler must be used within an ExternalCompilerProvider',
		);
	}
	return context;
};
