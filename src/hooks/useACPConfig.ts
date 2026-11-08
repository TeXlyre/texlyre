// src/hooks/useACPConfig.ts
import { useContext } from 'react';

import { ACPConfigContext } from '../contexts/ACPConfigContext';

export const useACPConfig = () => {
	const context = useContext(ACPConfigContext);
	if (!context) {
		throw new Error('useACPConfig must be used within ACPConfigProvider');
	}
	return context;
};
