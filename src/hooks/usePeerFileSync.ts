// src/hooks/usePeerFileSync.ts
import { useContext } from 'react';

import { PeerFileSyncContext } from '../contexts/PeerFileSyncContext';

export const usePeerFileSync = () => {
	const context = useContext(PeerFileSyncContext);
	if (!context) {
		throw new Error('usePeerFileSync must be used within a FileSyncProvider');
	}
	return context;
};
