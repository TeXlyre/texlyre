// src/components/chat/ChatPanel.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
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
			className={`ui-panel ${isCollapsed ? 'collapsed' : 'expanded'} ${className}`}
			data-role='chat'
		>
			<div
				className='ui-panel-header'
				data-role='chat'
				onClick={toggleCollapsed}
			>
				<div className='ui-panel-heading'>
					<span
						className='ui-status-dot'
						data-tone={
							isConnected && !isCollabOfflineMode ? 'success' : 'muted'
						}
						title={
							isCollabOfflineMode
								? t('Collaboration offline')
								: isConnected
									? t('Connected')
									: t('Disconnected')
						}
					/>
					<span className='ui-panel-title'>{t('Project Chat')}</span>
					{messages.length > 0 && (
						<span
							className='ui-badge'
							data-role='chat-count'
							data-variant='count'
						>
							{messages.length}
						</span>
					)}
				</div>
				<div className='ui-toolbar-actions' data-gap='sm'>
					<button
						type='button'
						className='ui-icon-button'
						data-role='chat-collapse'
						data-variant='ghost'
						data-size='xs'
					>
						{isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
					</button>
				</div>
			</div>

			{!isCollapsed && (
				<div className='ui-panel-content' data-role='chat'>
					<div className='ui-list' data-role='chat-messages'>
						{messages.length === 0 ? (
							<div className='empty-chat ui-empty-state'>
								<p>{t('Welcome to the project chat!')}</p>
								<br />
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

					<div className='ui-toolbar' data-role='chat-input'>
						<textarea
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t('Type a message...')}
							className='ui-field-control'
							data-role='chat-input'
							disabled={!isConnected || isCollabOfflineMode}
							rows={1}
						/>

						<button
							type='button'
							onClick={handleSendMessage}
							disabled={
								!inputValue.trim() || !isConnected || isCollabOfflineMode
							}
							className='button primary'
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
