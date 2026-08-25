// src/hooks/useTypesetterConfig.ts
import { useContext } from 'react';

import { TypesetterConfigContext } from '../contexts/TypesetterConfigContext';

export const useTypesetterConfig = () => {
	const context = useContext(TypesetterConfigContext);
	if (!context) {
		throw new Error(
			'useTypesetterConfig must be used within TypesetterConfigProvider',
		);
	}
	return context;
};
