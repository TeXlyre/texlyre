import { useContext } from 'react';

import { LocaleContext } from '../contexts/LocaleContext';

export const useLanguage = () => {
	const context = useContext(LocaleContext);
	if (!context) {
		throw new Error('useLanguage must be used within a LanguageProvider');
	}
	return context;
};
