import { useContext } from 'react';

import { SharedToolPreferencesContext } from '../contexts/SharedToolPreferencesContext';

export const useSharedToolPreferences = () => {
	const context = useContext(SharedToolPreferencesContext);
	if (!context) {
		throw new Error(
			'useSharedToolPreferences must be used within SharedToolPreferencesProvider',
		);
	}
	return context;
};
