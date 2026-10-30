// src/components/agent/AgentSidePanel.tsx
import type React from 'react';
import { useContext } from 'react';

import { SharedToolsContext } from '../../contexts/SharedToolsContext';
import { useACPConfig } from '../../hooks/useACPConfig';
import { useAgentDock } from '../../hooks/useAgentDock';
import ResizablePanel from '../common/ResizablePanel';
import AgentPanel from './AgentPanel';

// The agent panel docked to the right of the editor, shown instead of the
// Agent tab in the footer chat once the user docks it.
const AgentSidePanel: React.FC = () => {
	const { configs } = useACPConfig();
	const { docked, width, collapsed, setWidth, setCollapsed } = useAgentDock();
	const sharedAgents = useContext(SharedToolsContext)?.sharedAgents ?? [];
	const hasAgents =
		configs.some((config) => config.enabled) || sharedAgents.length > 0;

	if (!hasAgents || !docked) return null;

	return (
		<ResizablePanel
			direction='horizontal'
			width={width}
			minWidth={300}
			maxWidth='60%'
			alignment='start'
			onResize={setWidth}
			collapsed={collapsed}
			onCollapse={setCollapsed}
			className='agent-side-panel'
		>
			<AgentPanel />
		</ResizablePanel>
	);
};

export default AgentSidePanel;
