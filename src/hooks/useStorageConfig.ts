// src/hooks/useStorageConfig.ts
import { useContext } from 'react';

import { StorageConfigContext } from '../contexts/StorageConfigContext';

export const useStorageConfig = () => {
	const context = useContext(StorageConfigContext);
	if (!context) {
		throw new Error(
			'useStorageConfig must be used within StorageConfigProvider',
		);
	}
	return context;
};
