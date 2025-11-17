// src/components/chat/ChatMessage.tsx
import type React from 'react';

import { formatDate, formatTimestamp } from '../../utils/dateUtils';

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
	return (
		<div
			className={`chat-message ${isOwnMessage ? 'own-message' : 'other-message'}`}
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
