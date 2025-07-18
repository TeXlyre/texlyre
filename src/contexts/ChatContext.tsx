// src/contexts/ChatContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type * as Y from "yjs";

import { useAuth } from "../hooks/useAuth";
import { useSettings} from "../hooks/useSettings";
import { collabService } from "../services/CollabService";
import type { ChatContextType, ChatMessage } from "../types/chat";
import type { YjsDocUrl } from "../types/yjs";

export const ChatContext = createContext<ChatContextType | null>(null);

interface ChatProviderProps {
	children: ReactNode;
	docUrl: YjsDocUrl;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
	children,
	docUrl,
}) => {
	const { user } = useAuth();
	const { getSetting } = useSettings();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const messagesArrayRef = useRef<Y.Array<ChatMessage> | null>(null);

	const projectId = docUrl.startsWith("yjs:") ? docUrl.slice(4) : docUrl;

	useEffect(() => {
		if (!projectId) return;

		const signalingServersSetting = getSetting("collab-signaling-servers");
		const awarenessTimeoutSetting = getSetting("collab-awareness-timeout");
		const autoReconnectSetting = getSetting("collab-auto-reconnect");

		// Wait until all collaboration settings are available
		if (!signalingServersSetting || !awarenessTimeoutSetting || !autoReconnectSetting) {
			return;
		}

		const signalingServers = signalingServersSetting.value as string;
		const awarenessTimeout = awarenessTimeoutSetting.value as number;
		const autoReconnect = autoReconnectSetting.value as boolean;

		const serversToUse = signalingServers.split(",").map((s) => s.trim());

		const { doc } = collabService.connect(projectId, "chat", {
			signalingServers: serversToUse,
			autoReconnect,
			awarenessTimeout: awarenessTimeout * 1000,
		});

		const messagesArray = doc.getArray<ChatMessage>("messages");
		messagesArrayRef.current = messagesArray;

		const observer = () => {
			const currentMessages = messagesArray.toArray();
			setMessages(currentMessages);
		};

		messagesArray.observe(observer);
		setIsConnected(true);
		observer();

		return () => {
			messagesArray.unobserve(observer);
			collabService.disconnect(projectId, "chat");
			messagesArrayRef.current = null;
			setIsConnected(false);
		};
	}, [projectId, getSetting]);

	const sendMessage = useCallback(
		(content: string) => {
			if (!content.trim() || !user || !messagesArrayRef.current) return;

			const message: ChatMessage = {
				id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
				user: user.username,
				content: content.trim(),
				timestamp: Date.now(),
			};

			messagesArrayRef.current.push([message]);
		},
		[user],
	);

	return (
		<ChatContext.Provider value={{ messages, isConnected, sendMessage }}>
			{children}
		</ChatContext.Provider>
	);
};