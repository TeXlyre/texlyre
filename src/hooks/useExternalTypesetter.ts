// src/hooks/useExternalTypesetter.ts
import { useContext } from 'react';

import { ExternalTypesetterContext } from '../contexts/ExternalTypesetterContext';

export const useExternalTypesetter = () => {
	const context = useContext(ExternalTypesetterContext);
	if (!context) {
		throw new Error(
			'useExternalCompiler must be used within an ExternalCompilerProvider',
		);
	}
	return context;
};
