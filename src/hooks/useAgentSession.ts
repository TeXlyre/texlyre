// src/hooks/useAgentSession.ts
import { useContext } from 'react';

import { AgentSessionContext } from '../contexts/AgentSessionContext';

export const useAgentSession = () => {
	const context = useContext(AgentSessionContext);
	if (!context) {
		throw new Error('useAgentSession must be used within AgentSessionProvider');
	}
	return context;
};
