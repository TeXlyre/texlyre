// src/hooks/useFileTree.ts
import { useContext } from 'react';

import { FileTreeContext } from '../contexts/FileTreeContext';

export const useFileTree = () => {
	const context = useContext(FileTreeContext);
	if (!context) {
		throw new Error('useFileTree must be used within a FileTreeProvider');
	}
	return context;
};
