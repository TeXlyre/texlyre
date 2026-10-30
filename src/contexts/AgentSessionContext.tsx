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
import { useFileTree } from '../hooks/useFileTree';
import { agentChatStore, chatTitle } from '../services/AgentChatStore';
import {
	describeEditorFocus,
	editorFocusLabel,
	editorFocusService,
} from '../services/EditorFocusService';
import { fileStoreService } from '../services/FileStoreService';
import { genericACPService } from '../services/GenericACPService';
import { YjsProjectFileSystem } from '../services/ProjectFileSystem';
import type {
	ACPPermissionOutcome,
	ACPServerConfig,
	ACPStopReason,
} from '../types/acp';
import type {
	AgentChat,
	AgentChatSummary,
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

// Saves wait for the transcript to settle, so a streamed reply is not written
// once per chunk.
const SAVE_DELAY_MS = 800;

type ChatInfo = Omit<AgentChat, 'title' | 'updatedAt' | 'entries'>;

interface AgentSessionContextType {
	agents: ACPServerConfig[];
	activeAgentId: string | null;
	setActiveAgentId: (id: string) => void;
	status: AgentStatus;
	entries: AgentEntry[];
	pendingPermission: PendingPermission | null;
	send: (
		text: string,
		options?: { includeEditorContext?: boolean },
	) => Promise<void>;
	cancel: () => void;
	newSession: () => void;
	chats: AgentChatSummary[];
	chatId: string | null;
	refreshChats: () => void;
	selectChat: (id: string) => Promise<void>;
	deleteChat: (id: string) => Promise<void>;
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
	// The project's file storage is ready once the file tree has loaded.
	const { isLoading: isStorageLoading } = useFileTree();
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
	const [chats, setChats] = useState<AgentChatSummary[]>([]);
	const [chat, setChatState] = useState<ChatInfo | null>(null);
	// Read by async callbacks, which would otherwise see a stale chat.
	const chatRef = useRef<ChatInfo | null>(null);
	const setChat = useCallback((next: ChatInfo | null) => {
		chatRef.current = next;
		setChatState(next);
	}, []);
	// The entries a chat was opened with, so opening it does not count as a
	// change and move it to the top of the list.
	const loadedEntriesRef = useRef<AgentEntry[] | null>(null);
	const pendingSaveRef = useRef<{ chat: AgentChat; projectId: string } | null>(
		null,
	);

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

	const flushSave = useCallback(async () => {
		const pending = pendingSaveRef.current;
		pendingSaveRef.current = null;
		if (!pending) return;
		try {
			if (!(await agentChatStore.save(pending.chat, pending.projectId))) return;
			const { id, agentId, title, updatedAt } = pending.chat;
			setChats((list) => [
				{ id, agentId, title, updatedAt },
				...list.filter((summary) => summary.id !== id),
			]);
		} catch (error) {
			moduleLog.error('Could not save the agent chat:', error);
		}
	}, []);

	useEffect(() => {
		if (!chat || entries.length === 0) return;
		if (entries === loadedEntriesRef.current) return;
		pendingSaveRef.current = {
			chat: {
				...chat,
				title: chatTitle(entries),
				updatedAt: Date.now(),
				entries,
			},
			projectId: fileStoreService.getCurrentProjectId(),
		};
		const timer = setTimeout(() => void flushSave(), SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [chat, entries, flushSave]);

	// Leaving the project saves what is still pending.
	useEffect(() => () => void flushSave(), [flushSave]);

	const refreshChats = useCallback(() => {
		agentChatStore
			.list()
			.then(setChats)
			.catch((error) => moduleLog.warn('Could not list agent chats:', error));
	}, []);

	useEffect(() => {
		if (!isStorageLoading) refreshChats();
	}, [isStorageLoading, refreshChats]);

	const startNewChat = useCallback(() => {
		endSession();
		setChat(null);
		loadedEntriesRef.current = null;
		dispatch({ type: 'reset' });
	}, [endSession, setChat]);

	// Choosing another agent starts a new chat. Opening a chat selects its
	// agent too, which leaves the chat open since the agents match.
	const previousAgentIdRef = useRef(activeAgentId);
	useEffect(() => {
		if (previousAgentIdRef.current === activeAgentId) return;
		previousAgentIdRef.current = activeAgentId;
		if (chatRef.current?.agentId === activeAgentId) return;
		if (sessionRef.current || chatRef.current) {
			void flushSave();
			startNewChat();
		}
	}, [activeAgentId, flushSave, startNewChat]);

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

		const current = chatRef.current;
		if (current?.sessionId && current.agentId === activeAgentId) {
			try {
				await genericACPService.loadSession(activeAgentId, current.sessionId);
				sessionRef.current = {
					agentId: activeAgentId,
					sessionId: current.sessionId,
				};
				return sessionRef.current;
			} catch (error) {
				moduleLog.warn('Could not resume the agent session:', error);
				notice(
					t(
						'The agent could not resume this chat, so it starts without the earlier messages.',
					),
					'info',
				);
			}
		}

		const sessionId = await genericACPService.newSession(activeAgentId);
		sessionRef.current = { agentId: activeAgentId, sessionId };
		if (chatRef.current) {
			setChat({ ...chatRef.current, agentId: activeAgentId, sessionId });
		}
		return sessionRef.current;
	}, [activeAgentId, notice, setChat]);

	const send = useCallback(
		async (text: string, { includeEditorContext = true } = {}) => {
			const prompt = text.trim();
			if (!prompt || status === 'prompting' || status === 'connecting') return;
			if (!activeAgentId) return;

			if (!chatRef.current) {
				setChat({
					version: 1,
					id: nanoid(),
					agentId: activeAgentId,
					sessionId: null,
					createdAt: Date.now(),
				});
			}

			// Which file is open, sent ahead of the message unless the user
			// turned it off.
			const focus = includeEditorContext
				? editorFocusService.getState()
				: { focus: null, cursor: null };
			const context = describeEditorFocus(focus);
			dispatch({
				type: 'add',
				entry: {
					id: nanoid(),
					kind: 'user',
					text: prompt,
					context: (context && editorFocusLabel(focus)) || undefined,
				},
			});

			try {
				const session = await ensureSession();
				setStatus('prompting');
				const result = await genericACPService.prompt(
					session.agentId,
					session.sessionId,
					context
						? [
								{ type: 'text', text: context },
								{ type: 'text', text: prompt },
							]
						: [{ type: 'text', text: prompt }],
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
		[activeAgentId, ensureSession, notice, setChat, status],
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
		void flushSave();
		startNewChat();
	}, [flushSave, startNewChat]);

	const selectChat = useCallback(
		async (id: string) => {
			if (id === chatRef.current?.id) return;
			await flushSave();
			const loaded = await agentChatStore.load(id).catch((error) => {
				moduleLog.error('Could not open the agent chat:', error);
				return null;
			});
			if (!loaded) {
				notice(t('This chat could not be opened.'), 'error');
				refreshChats();
				return;
			}

			endSession();
			const { version, agentId, sessionId, createdAt, entries: saved } = loaded;
			if (agents.some((agent) => agent.id === loaded.agentId)) {
				setSelectedAgentId(loaded.agentId);
			}
			setChat({ version, id: loaded.id, agentId, sessionId, createdAt });
			loadedEntriesRef.current = saved;
			dispatch({ type: 'load', entries: saved });
		},
		[agents, endSession, flushSave, notice, refreshChats, setChat],
	);

	const deleteChat = useCallback(
		async (id: string) => {
			if (pendingSaveRef.current?.chat.id === id) pendingSaveRef.current = null;
			try {
				await agentChatStore.remove(id);
			} catch (error) {
				moduleLog.error('Could not delete the agent chat:', error);
				notice(t('This chat could not be deleted.'), 'error');
				return;
			}
			setChats((list) => list.filter((summary) => summary.id !== id));
			if (chatRef.current?.id === id) startNewChat();
		},
		[notice, startNewChat],
	);

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
				chats,
				chatId: chat?.id ?? null,
				refreshChats,
				selectChat,
				deleteChat,
				respondToPermission,
				readFile,
			}}
		>
			{children}
		</AgentSessionContext.Provider>
	);
};
