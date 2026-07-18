// src/contexts/CollabContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type * as Y from 'yjs';

import { useSettings } from '../hooks/useSettings';
import { collabService } from '../services/CollabService';
import type {
	CollabContextType,
	CollabProvider as ICollabProvider,
	CollabProviderType,
} from '../types/collab';
import type { YjsDocUrl } from '../types/yjs';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('CollabContext');

export const CollabContext = createContext<CollabContextType | null>(null);

interface CollabProviderProps {
	children: ReactNode;
	docUrl: YjsDocUrl;
	collectionName: string;
}

type ProviderWithConnectionState = ICollabProvider & {
	connected?: boolean;
	wsconnected?: boolean;
	signalingConns?: unknown[] | Set<unknown> | Map<unknown, unknown>;
};

const getProviderConnectionState = (
	provider: ICollabProvider | null | undefined,
): boolean => {
	const providerWithState = provider as ProviderWithConnectionState | undefined;
	if (!providerWithState) return false;

	const signalingConns = providerWithState.signalingConns;
	if (signalingConns) {
		const conns = Array.isArray(signalingConns)
			? signalingConns
			: Array.from(
					signalingConns instanceof Map
						? signalingConns.values()
						: signalingConns,
				);

		return conns.some((conn) => {
			const signalingConn = conn as {
				connected?: boolean;
				ws?: WebSocket;
				wsconnected?: boolean;
			};

			return (
				signalingConn.connected === true ||
				signalingConn.wsconnected === true ||
				signalingConn.ws?.readyState === WebSocket.OPEN
			);
		});
	}

	if (typeof providerWithState.wsconnected === 'boolean') {
		return providerWithState.wsconnected;
	}

	if (typeof providerWithState.connected === 'boolean') {
		return providerWithState.connected;
	}

	return false;
};

export const CollabProvider: React.FC<CollabProviderProps> = ({
	children,
	docUrl,
	collectionName,
}) => {
	const [data, setData] = useState<any>(undefined);
	const [isConnected, setIsConnected] = useState(false);
	const [doc, setDoc] = useState<Y.Doc | undefined>();
	const [provider, setProvider] = useState<ICollabProvider | undefined>();
	const isUpdatingRef = useRef(false);
	const { getSetting } = useSettings();

	const providerType =
		(getSetting('collab-provider-type')?.value as
			| CollabProviderType
			| undefined) ?? 'webrtc';
	const signalingServers =
		(getSetting('collab-signaling-servers')?.value as string | undefined) ??
		'ws://ywebrtc.localhost:8082/';
	const websocketServer =
		(getSetting('collab-websocket-server')?.value as string | undefined) ??
		'ws://yweb.localhost:8082/';
	const awarenessTimeout =
		(getSetting('collab-awareness-timeout')?.value as number | undefined) ?? 30;
	const autoReconnect =
		(getSetting('collab-auto-reconnect')?.value as boolean | undefined) ??
		false;

	const projectId = useMemo(() => {
		return docUrl.startsWith('yjs:')
			? docUrl.slice(4)
			: docUrl.replace(/[^a-zA-Z0-9]/g, '-');
	}, [docUrl]);

	useEffect(() => {
		if (!projectId || !collectionName) return;

		const serversToUse =
			signalingServers.length > 0
				? signalingServers.split(',').map((s) => s.trim())
				: undefined;

		try {
			const { doc: ydoc, provider: yprovider } = collabService.connect(
				projectId,
				collectionName,
				{
					providerType,
					signalingServers: serversToUse,
					websocketServer,
					autoReconnect,
					awarenessTimeout: awarenessTimeout * 1000,
				},
			);
			setDoc(ydoc);
			setProvider((yprovider as ICollabProvider) ?? undefined);

			const ymap = ydoc.getMap('data');

			const observer = () => {
				if (!isUpdatingRef.current) {
					setData(ymap.toJSON());
				}
			};

			const updateProviderStatus = () => {
				setIsConnected(getProviderConnectionState(yprovider));
			};

			const handleProviderStatus = (event: {
				connected?: boolean;
				status?: string;
			}) => {
				if (providerType === 'webrtc') {
					updateProviderStatus();
					return;
				}

				setIsConnected(
					event.connected === true || event.status === 'connected',
				);
			};

			ymap.observe(observer);
			setData(ymap.toJSON());
			setIsConnected(false);
			yprovider?.on('status', handleProviderStatus);

			const statusInterval = window.setInterval(updateProviderStatus, 1000);
			updateProviderStatus();

			return () => {
				window.clearInterval(statusInterval);
				yprovider?.off?.('status', handleProviderStatus);
				ymap.unobserve(observer);
				collabService.disconnect(projectId, collectionName);
				setIsConnected(false);
				setDoc(undefined);
				setProvider(undefined);
			};
		} catch (error) {
			moduleLog.warn('Connection failed, continuing in offline mode:', error);
			setIsConnected(false);
			setDoc(undefined);
			setProvider(undefined);
			return () => {};
		}
	}, [
		projectId,
		collectionName,
		providerType,
		signalingServers,
		websocketServer,
		autoReconnect,
		awarenessTimeout,
	]);

	const changeData = useCallback(
		(fn: (currentData: any) => void) => {
			if (!doc) return;

			const ymap = doc.getMap('data');
			isUpdatingRef.current = true;

			doc.transact(() => {
				const currentData = ymap.toJSON();
				fn(currentData);

				for (const key of ymap.keys()) {
					ymap.delete(key);
				}
				if (typeof currentData === 'object' && currentData !== null) {
					Object.entries(currentData).forEach(([key, value]) => {
						ymap.set(key, value);
					});
				}
			});

			setData(ymap.toJSON());

			isUpdatingRef.current = false;
		},
		[doc],
	);

	const getAwareness = useCallback(
		(collectionName: string) =>
			collabService.getAwareness(projectId, collectionName),
		[projectId],
	);

	const value: CollabContextType<any> = {
		collabService,
		doc,
		provider,
		data,
		changeData,
		isConnected,
		getAwareness,
	};

	return (
		<CollabContext.Provider value={value}>{children}</CollabContext.Provider>
	);
};
