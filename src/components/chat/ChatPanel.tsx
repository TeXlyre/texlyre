// src/components/chat/ChatPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import { useOffline } from '../../hooks/useOffline';
import { ChevronDownIcon, ChevronUpIcon } from '../common/Icons';
import ChatMessage from './ChatMessage';

interface ChatPanelProps {
	className?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ className = '' }) => {
	const { user } = useAuth();
	const { messages, isConnected, sendMessage } = useChat();
	const { isCollabOfflineMode } = useOffline();
	const [isCollapsed, setIsCollapsed] = useState(true);
	const [inputValue, setInputValue] = useState('');
	const messagesEndRef = useRef<HTMLDivElement>(null);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: messages is an intentional trigger; its change is the signal to scroll, even though the body reads it via the ref. */
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
			<div className='chat-panel-header' onClick={toggleCollapsed}>
				<span className='chat-panel-title'>{t('Project Chat')}</span>
				<div className='chat-panel-status'>
					<div
						className={`connection-indicator ${
							isConnected && !isCollabOfflineMode ? 'connected' : 'offline'
						}`}
						title={
							isCollabOfflineMode
								? t('Collaboration offline')
								: isConnected
									? t('Connected')
									: t('Disconnected')
						}
					/>
					{messages.length > 0 && (
						<span className='message-count'>{messages.length}</span>
					)}
					<button className='collapse-toggle'>
						{isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
					</button>
				</div>
			</div>

			{!isCollapsed && (
				<div className='chat-panel-content'>
					<div className='chat-panel-messages'>
						{messages.length === 0 ? (
							<div className='empty-chat'>
								<p>{t('Welcome to the project chat!')}</p>
								<p>{t('Start a conversation with your collaborators.')}</p>
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

					<div className='chat-panel-input-container'>
						<textarea
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t('Type a message...')}
							className='chat-panel-input'
							disabled={!isConnected || isCollabOfflineMode}
							rows={1}
						/>

						<button
							onClick={handleSendMessage}
							disabled={
								!inputValue.trim() || !isConnected || isCollabOfflineMode
							}
							className='chat-panel-send-button'
						>
							{t('Send')}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default ChatPanel;
