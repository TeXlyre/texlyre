// src/contexts/CollabContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";

import { useSettings } from "../hooks/useSettings";
import { collabService } from "../services/CollabService";
import type { CollabContextType } from "../types/collab";
import type { YjsDocUrl } from "../types/yjs";

export const CollabContext = createContext<CollabContextType | null>(null);

interface CollabProviderProps {
	children: ReactNode;
	docUrl: YjsDocUrl;
	collectionName: string;
}

export const CollabProvider: React.FC<CollabProviderProps> = ({
	children,
	docUrl,
	collectionName,
}) => {
	const [data, setData] = useState<any>(undefined);
	const [isConnected, setIsConnected] = useState(false);
	const [doc, setDoc] = useState<Y.Doc | undefined>();
	const [provider, setProvider] = useState<WebrtcProvider | undefined>();
	const isUpdatingRef = useRef(false);
	const { registerSetting, getSetting, commitSetting } = useSettings();
	const settingsRegistered = useRef(false);

	const [signalingServers, setSignalingServers] = useState<string>(
		"wss://ywebrtc.emaily.re",
	);
	const [awarenessTimeout, setAwarenessTimeout] = useState(30);
	const [autoReconnect, setAutoReconnect] = useState(false);

	const projectId = useMemo(() => {
		return docUrl.startsWith("yjs:")
			? docUrl.slice(4)
			: docUrl.replace(/[^a-zA-Z0-9]/g, "-");
	}, [docUrl]);

	// Register and load settings
	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		registerSetting({
			id: "collab-signaling-servers",
			category: "Collaboration",
			subcategory: "Real-time Synchronization",
			type: "text",
			label: "Signaling servers",
			description: "Comma-separated list of Yjs WebRTC signaling server URLs",
			defaultValue: "wss://ywebrtc.emaily.re",
			onChange: (value) => {
				setSignalingServers(value as string);
			},
			liveUpdate: false,
		});

		registerSetting({
			id: "collab-awareness-timeout",
			category: "Collaboration",
			subcategory: "Real-time Synchronization",
			type: "number",
			label: "Awareness timeout (seconds)",
			description: "How long to wait before considering other users inactive",
			defaultValue: 30,
			min: 10,
			max: 300,
			onChange: (value) => {
				setAwarenessTimeout(value as number);
			},
		});

		registerSetting({
			id: "collab-auto-reconnect",
			category: "Collaboration",
			subcategory: "Real-time Synchronization",
			type: "checkbox",
			label: "Auto-reconnect on disconnect",
			description:
				"Automatically attempt to reconnect when the connection is lost",
			defaultValue: false,
			onChange: (value) => {
				// This setting can be live updated
				setAutoReconnect(value as boolean);
			},
		});
	}, [registerSetting]);

	useEffect(() => {
		if (!projectId || !collectionName) return;

		// Helper function to validate WebSocket URLs
		const isValidWebSocketUrl = (url: string): boolean => {
			try {
				const u = new URL(url);
				return (
					(u.protocol === "ws:" || u.protocol === "wss:") &&
					u.hostname.length > 0
				);
			} catch (e) {
				return false;
			}
		};

		const inputServers = signalingServers.split(",").map((s) => s.trim());
		const validSignalingServers: string[] = [];

		inputServers.forEach((serverUrl) => {
			if (serverUrl.length === 0) {
				return;
			}
			try {
				const urlObj = new URL(serverUrl);
				if (urlObj.protocol === "http:" || urlObj.protocol === "https:") {
					// Warn if http/https are provided, as they are not directly supported for WebSockets
					console.warn(
						`[CollabContext] Warning: Signaling server URL '${serverUrl}' uses HTTP/HTTPS protocol. Only 'ws://' or 'wss://' are supported for WebRTC signaling. This URL will be ignored.`,
					);
				} else if (isValidWebSocketUrl(serverUrl)) {
					validSignalingServers.push(serverUrl);
				} else {
					console.warn(
						`[CollabContext] Warning: Signaling server URL '${serverUrl}' is not a valid WebSocket URL and will be ignored. Please use 'ws://' or 'wss://' with a valid hostname.`,
					);
				}
			} catch (e) {
				console.warn(
					`[CollabContext] Warning: Invalid URL format for signaling server '${serverUrl}'. Please ensure it's a valid URL.`,
				);
			}
		});

		// If no valid servers are provided after filtering, fall back to a default known good server
		const serversToUse =
			validSignalingServers.length > 0
				? validSignalingServers
				: ["wss://ywebrtc.emaily.re"];

		console.log(
			`[CollabContext] Connecting with signaling servers: ${serversToUse.join(", ")}`,
		);

		const { doc: ydoc, provider: yprovider } = collabService.connect(
			projectId,
			collectionName,
			{
				signalingServers: serversToUse,
				autoReconnect,
				awarenessTimeout: awarenessTimeout * 1000,
			},
		);
		setDoc(ydoc);
		setProvider(yprovider);

		const ymap = ydoc.getMap("data");

		const observer = () => {
			if (!isUpdatingRef.current) {
				setData(ymap.toJSON());
			}
		};

		ymap.observe(observer);
		setData(ymap.toJSON());
		setIsConnected(true);

		return () => {
			ymap.unobserve(observer);
			collabService.disconnect(projectId, collectionName);
			setIsConnected(false);
			setDoc(undefined);
			setProvider(undefined);
		};
	}, [
		projectId,
		collectionName,
		signalingServers,
		autoReconnect,
		awarenessTimeout,
	]);

	const changeData = useCallback(
		(fn: (currentData: any) => void) => {
			if (!doc) return;

			const ymap = doc.getMap("data");
			isUpdatingRef.current = true;

			doc.transact(() => {
				const currentData = ymap.toJSON();
				fn(currentData);

				for (const key of ymap.keys()) {
					ymap.delete(key);
				}
				if (typeof currentData === "object" && currentData !== null) {
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

	const value: CollabContextType<any> = {
		collabService,
		doc,
		provider,
		data,
		changeData,
		isConnected,
	};

	return (
		<CollabContext.Provider value={value}>{children}</CollabContext.Provider>
	);
};
