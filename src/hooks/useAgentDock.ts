// src/hooks/useAgentDock.ts
import { useCallback, useEffect, useState } from 'react';

import { useProperties } from './useProperties';

const DEFAULT_WIDTH = 420;
// Narrower windows have no room beside the editor; the agent then stays in
// the chat panel whatever the stored preference.
const DOCKABLE_QUERY = '(min-width: 900px)';

const matchesDockable = () =>
	typeof window.matchMedia !== 'function' ||
	window.matchMedia(DOCKABLE_QUERY).matches;

const AGENT_DOCK_PROPERTIES = [
	{ id: 'agent-panel-docked', defaultValue: false },
	{ id: 'agent-panel-width', defaultValue: DEFAULT_WIDTH },
	{ id: 'agent-panel-collapsed', defaultValue: false },
];

// Where the agent panel lives: the footer chat panel, or a resizable panel
// docked to the right of the editor. Stored as per-user layout properties.
export const useAgentDock = () => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [canDock, setCanDock] = useState(matchesDockable);

	useEffect(() => {
		if (typeof window.matchMedia !== 'function') return;
		const query = window.matchMedia(DOCKABLE_QUERY);
		const update = () => setCanDock(query.matches);
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}, []);

	useEffect(() => {
		for (const property of AGENT_DOCK_PROPERTIES) {
			registerProperty({ ...property, category: 'UI', subcategory: 'Layout' });
		}
	}, [registerProperty]);

	const docked = canDock && getProperty('agent-panel-docked') === true;
	const width = Number(getProperty('agent-panel-width') ?? DEFAULT_WIDTH);
	const collapsed = getProperty('agent-panel-collapsed') === true;

	const setDocked = useCallback(
		(value: boolean) => {
			setProperty('agent-panel-docked', value);
			if (value) setProperty('agent-panel-collapsed', false);
		},
		[setProperty],
	);
	const setWidth = useCallback(
		(value: number) => setProperty('agent-panel-width', value),
		[setProperty],
	);
	const setCollapsed = useCallback(
		(value: boolean) => setProperty('agent-panel-collapsed', value),
		[setProperty],
	);

	return {
		canDock,
		docked,
		width,
		collapsed,
		setDocked,
		setWidth,
		setCollapsed,
	};
};
