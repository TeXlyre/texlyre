import { useContext } from 'react';

import { CollabContext } from '../contexts/CollabContext';
import type { CollabContextType } from '../types/collab';

export const useCollab = <T = unknown>(): CollabContextType<T> => {
	const context = useContext(CollabContext);
	if (!context) {
		throw new Error('useCollab must be used within a CollabProvider');
	}
	return context as CollabContextType<T>;
};
