// src/components/chat/ChatPanel.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import { ChevronDownIcon, ChevronUpIcon } from '../common/Icons';
import ChatMessage from './ChatMessage';

interface ChatPanelProps {
	className?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ className = '' }) => {
	const { user } = useAuth();
	const { messages, isConnected, sendMessage } = useChat();
	const [isCollapsed, setIsCollapsed] = useState(true);
	const [inputValue, setInputValue] = useState('');
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (messagesEndRef.current && !isCollapsed) {
			messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [messages, isCollapsed]);

	const handleSendMessage = () => {
		if (!inputValue.trim()) return;
		sendMessage(inputValue);
		setInputValue('');
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	const toggleCollapsed = () => {
		setIsCollapsed(!isCollapsed);
	};

	return (
		<div
			className={`chat-panel ${isCollapsed ? 'collapsed' : 'expanded'} ${className}`}
		>
			<div className="chat-panel-header" onClick={toggleCollapsed}>
				<span className="chat-panel-title">Project Chat</span>
				<div className="chat-panel-status">
					{isConnected && (
						<div className="connection-indicator connected" title="Connected" />
					)}
					{messages.length > 0 && (
						<span className="message-count">{messages.length}</span>
					)}
					<button className="collapse-toggle">
						{isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
					</button>
				</div>
			</div>

			{!isCollapsed && (
				<div className="chat-panel-content">
					<div className="chat-panel-messages">
						{messages.length === 0 ? (
							<div className="empty-chat">
								<p>Welcome to the project chat!</p>
								<p>Start a conversation with your collaborators.</p>
							</div>
						) : (
							messages.map((message) => (
								<ChatMessage
									key={message.id}
									message={message}
									isOwnMessage={message.user === user?.username}
								/>
							))
						)}
						<div ref={messagesEndRef} />
					</div>

					<div className="chat-panel-input-container">
						<textarea
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Type a message..."
							className="chat-panel-input"
							disabled={!isConnected}
							rows={1}
						/>
						<button
							onClick={handleSendMessage}
							disabled={!inputValue.trim() || !isConnected}
							className="chat-panel-send-button"
						>
							Send
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default ChatPanel;
