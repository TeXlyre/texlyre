// src/hooks/useHeaderVisibility.ts
import { useCallback } from 'react';

import { useProperties } from './useProperties';

export const HEADER_VISIBLE_PROPERTY = 'header-visible';

export const useHeaderVisibility = () => {
	const { getProperty, setProperty } = useProperties();
	const storedValue = getProperty(HEADER_VISIBLE_PROPERTY);

	const setHeaderVisible = useCallback(
		(visible: boolean) => {
			setProperty(HEADER_VISIBLE_PROPERTY, visible);
		},
		[setProperty],
	);

	return {
		headerVisible: storedValue === undefined ? true : Boolean(storedValue),
		setHeaderVisible,
	};
};
