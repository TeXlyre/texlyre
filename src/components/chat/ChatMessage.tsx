// src/components/chat/ChatMessage.tsx
import type React from "react";

import { formatDate } from "../../utils/dateUtils";

interface ChatMessage {
	id: string;
	user: string;
	content: string;
	timestamp: number;
}

interface ChatMessageProps {
	message: ChatMessage;
	isOwnMessage: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isOwnMessage }) => {
	const formatTimestamp = (timestamp: number): string => {
		const now = Date.now();
		const diff = now - timestamp;

		// Less than 1 minute
		if (diff < 60000) {
			return "Just now";
		}

		// Less than 1 hour
		if (diff < 3600000) {
			const minutes = Math.floor(diff / 60000);
			return `${minutes}m ago`;
		}

		// Less than 24 hours
		if (diff < 86400000) {
			const hours = Math.floor(diff / 3600000);
			return `${hours}h ago`;
		}

		// More than 24 hours - show date
		return new Date(timestamp).toLocaleDateString();
	};

	return (
		<div
			className={`chat-message ${isOwnMessage ? "own-message" : "other-message"}`}
		>
			<div className="message-content">
				{!isOwnMessage && <div className="message-user">{message.user}</div>}
				<div className="message-text">{message.content}</div>
				<div
					className="message-timestamp"
					title={formatDate(message.timestamp)}
				>
					{formatTimestamp(message.timestamp)}
				</div>
			</div>
		</div>
	);
};

export default ChatMessage;
