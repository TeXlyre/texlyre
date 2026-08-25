import { useContext } from 'react';

import { SharedToolsContext } from '../contexts/SharedToolsContext';

export const useSharedTools = () => {
	const context = useContext(SharedToolsContext);
	if (!context) {
		throw new Error('useSharedTools must be used within SharedToolsProvider');
	}
	return context;
};
