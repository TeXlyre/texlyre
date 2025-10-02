// src/hooks/useSecrets.ts
import { useContext } from 'react';

import { SecretsContext } from '../contexts/SecretsContext';

export const useSecrets = () => {
	const context = useContext(SecretsContext);
	if (!context) {
		throw new Error('useSecrets must be used within a SecretsProvider');
	}
	return context;
};
