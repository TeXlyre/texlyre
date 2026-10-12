// src/contexts/AgentSessionContext.tsx
import type React from 'react';
import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { useACPConfig } from '../hooks/useACPConfig';
import { useEditor } from '../hooks/useEditor';
import { genericACPService } from '../services/GenericACPService';
import { YjsProjectFileSystem } from '../services/ProjectFileSystem';
import type {
	ACPPermissionOutcome,
	ACPServerConfig,
	ACPStopReason,
} from '../types/acp';
import type {
	AgentEntry,
	AgentStatus,
	PendingPermission,
} from '../types/agentSession';
import {
	entriesReducer,
	recordingFileSystem,
} from '../utils/agentSessionUtils';

const moduleLog = createNamedLogger('AgentSessionContext');

const STOP_REASON_NOTICES: Partial<Record<ACPStopReason, string>> = {
	cancelled: 'Stopped.',
	max_tokens: 'The agent ran out of output tokens.',
	max_turn_requests: 'The agent reached its step limit for this turn.',
	refusal: 'The agent declined to continue.',
};

interface AgentSessionContextType {
	agents: ACPServerConfig[];
	activeAgentId: string | null;
	setActiveAgentId: (id: string) => void;
	status: AgentStatus;
	entries: AgentEntry[];
	pendingPermission: PendingPermission | null;
	send: (text: string) => Promise<void>;
	cancel: () => void;
	newSession: () => void;
	respondToPermission: (optionId: string | null) => void;
	readFile: (path: string) => Promise<string | null>;
}

export const AgentSessionContext =
	createContext<AgentSessionContextType | null>(null);

interface AgentSessionProviderProps {
	children: ReactNode;
}

export const AgentSessionProvider: React.FC<AgentSessionProviderProps> = ({
	children,
}) => {
	const { configs } = useACPConfig();
	const { getCollabOptions } = useEditor();
	const agents = useMemo(
		() => configs.filter((config) => config.enabled),
		[configs],
	);

	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const activeAgentId =
		agents.find((agent) => agent.id === selectedAgentId)?.id ??
		agents[0]?.id ??
		null;

	const [status, setStatus] = useState<AgentStatus>('disconnected');
	const [entries, dispatch] = useReducer(entriesReducer, []);
	const [permissions, setPermissions] = useState<PendingPermission[]>([]);

	const sessionRef = useRef<{ agentId: string; sessionId: string } | null>(
		null,
	);
	const resolversRef = useRef(
		new Map<string, (outcome: ACPPermissionOutcome) => void>(),
	);
	// Read through a ref so a settings change does not rebuild the file system,
	// which would reinstall the handlers and end the session.
	const getCollabOptionsRef = useRef(getCollabOptions);
	useEffect(() => {
		getCollabOptionsRef.current = getCollabOptions;
	}, [getCollabOptions]);
	// The file system only holds this getter, so it is cheap to create where
	// it is used.
	const createFileSystem = useCallback(
		() =>
			new YjsProjectFileSystem(
				() => getCollabOptionsRef.current() ?? undefined,
			),
		[],
	);

	const notice = useCallback((text: string, tone: 'info' | 'error') => {
		dispatch({
			type: 'add',
			entry: { id: nanoid(), kind: 'notice', text, tone },
		});
	}, []);

	const cancelPermissions = useCallback(() => {
		for (const resolve of resolversRef.current.values()) {
			resolve({ outcome: 'cancelled' });
		}
		resolversRef.current.clear();
		setPermissions([]);
	}, []);

	// Install this project's handlers on the shared service while mounted.
	useEffect(() => {
		genericACPService.setFileSystem(
			recordingFileSystem(createFileSystem(), (change) =>
				dispatch({
					type: 'add',
					entry: { id: nanoid(), kind: 'change', ...change },
				}),
			),
		);
		genericACPService.setPermissionHandler(
			(configId, request) =>
				new Promise<ACPPermissionOutcome>((resolve) => {
					if (
						configId !== sessionRef.current?.agentId ||
						request.sessionId !== sessionRef.current?.sessionId
					) {
						resolve({ outcome: 'cancelled' });
						return;
					}
					const id = nanoid();
					resolversRef.current.set(id, resolve);
					setPermissions((queue) => [...queue, { id, request }]);
				}),
		);

		const unsubscribeUpdates = genericACPService.onSessionUpdate(
			(configId, notification) => {
				const current = sessionRef.current;
				if (
					configId === current?.agentId &&
					notification.sessionId === current.sessionId
				) {
					dispatch({ type: 'update', notification });
				}
			},
		);
		const unsubscribeStatus = genericACPService.onStatusChange(
			(configId, transportStatus) => {
				if (configId !== sessionRef.current?.agentId) return;
				if (transportStatus === 'disconnected' || transportStatus === 'error') {
					sessionRef.current = null;
					cancelPermissions();
					setStatus(transportStatus === 'error' ? 'error' : 'disconnected');
				}
			},
		);

		return () => {
			unsubscribeUpdates();
			unsubscribeStatus();
			cancelPermissions();
			genericACPService.setPermissionHandler(null);
			genericACPService.setFileSystem(new YjsProjectFileSystem());
			const current = sessionRef.current;
			sessionRef.current = null;
			// Leaving the project ends the agent process working on it.
			if (current) genericACPService.disconnect(current.agentId);
		};
	}, [createFileSystem, cancelPermissions]);

	const endSession = useCallback(() => {
		const current = sessionRef.current;
		sessionRef.current = null;
		cancelPermissions();
		if (current) genericACPService.disconnect(current.agentId);
		setStatus('disconnected');
	}, [cancelPermissions]);

	// Switching or removing the agent ends the old session.
	useEffect(() => {
		if (sessionRef.current && sessionRef.current.agentId !== activeAgentId) {
			endSession();
			dispatch({ type: 'reset' });
		}
	}, [activeAgentId, endSession]);

	const ensureSession = useCallback(async (): Promise<{
		agentId: string;
		sessionId: string;
	}> => {
		if (!activeAgentId) throw new Error(t('No agent is configured'));
		if (sessionRef.current?.agentId === activeAgentId) {
			return sessionRef.current;
		}
		setStatus('connecting');
		await genericACPService.connect(activeAgentId);
		const sessionId = await genericACPService.newSession(activeAgentId);
		sessionRef.current = { agentId: activeAgentId, sessionId };
		return sessionRef.current;
	}, [activeAgentId]);

	const send = useCallback(
		async (text: string) => {
			const prompt = text.trim();
			if (!prompt || status === 'prompting' || status === 'connecting') return;

			dispatch({
				type: 'add',
				entry: { id: nanoid(), kind: 'user', text: prompt },
			});

			try {
				const session = await ensureSession();
				setStatus('prompting');
				const result = await genericACPService.prompt(
					session.agentId,
					session.sessionId,
					[{ type: 'text', text: prompt }],
				);
				const message = STOP_REASON_NOTICES[result.stopReason];
				if (message) notice(t(message), 'info');
				setStatus('ready');
			} catch (error) {
				moduleLog.error('Agent prompt failed:', error);
				notice(error instanceof Error ? error.message : String(error), 'error');
				setStatus(sessionRef.current ? 'ready' : 'error');
			}
		},
		[ensureSession, notice, status],
	);

	const cancel = useCallback(() => {
		const current = sessionRef.current;
		if (!current) return;
		cancelPermissions();
		try {
			genericACPService.cancel(current.agentId, current.sessionId);
		} catch (error) {
			moduleLog.warn('Cancel failed:', error);
		}
	}, [cancelPermissions]);

	const newSession = useCallback(() => {
		endSession();
		dispatch({ type: 'reset' });
	}, [endSession]);

	const pendingPermission = permissions[0] ?? null;

	const respondToPermission = useCallback(
		(optionId: string | null) => {
			const current = pendingPermission;
			if (!current) return;
			const resolve = resolversRef.current.get(current.id);
			resolversRef.current.delete(current.id);
			resolve?.(
				optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' },
			);
			setPermissions((queue) =>
				queue.filter((entry) => entry.id !== current.id),
			);
		},
		[pendingPermission],
	);

	const readFile = useCallback(
		(path: string) =>
			createFileSystem()
				.readTextFile(path)
				.catch(() => null),
		[createFileSystem],
	);

	return (
		<AgentSessionContext.Provider
			value={{
				agents,
				activeAgentId,
				setActiveAgentId: setSelectedAgentId,
				status,
				entries,
				pendingPermission,
				send,
				cancel,
				newSession,
				respondToPermission,
				readFile,
			}}
		>
			{children}
		</AgentSessionContext.Provider>
	);
};
