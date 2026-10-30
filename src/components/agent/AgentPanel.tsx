// src/components/agent/AgentPanel.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useAgentDock } from '../../hooks/useAgentDock';
import { useAgentSession } from '../../hooks/useAgentSession';
import { chatTitle } from '../../services/AgentChatStore';
import type { AgentEntry } from '../../types/agentSession';
import { formatDate } from '../../utils/dateUtils';
import { ExpandIcon, MinimizeIcon, TrashIcon } from '../common/Icons';
import DiffView from './DiffView';
import { toolLabel } from './toolLabel';

const STATUS_TONE = {
	disconnected: 'muted',
	connecting: 'warning',
	ready: 'success',
	prompting: 'warning',
	error: 'danger',
} as const;

const ChangeEntry: React.FC<{
	entry: Extract<AgentEntry, { kind: 'change' }>;
}> = ({ entry }) => {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<div className='agent-entry' data-kind='change'>
			<button
				type='button'
				className='agent-change-toggle'
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
			>
				{entry.before === null
					? t('Created {{path}}', { path: entry.path })
					: t('Changed {{path}}', { path: entry.path })}
			</button>
			{isOpen && <DiffView before={entry.before} after={entry.after} />}
		</div>
	);
};

const Entry: React.FC<{ entry: AgentEntry }> = ({ entry }) => {
	switch (entry.kind) {
		case 'user':
		case 'agent':
			return (
				<div className='agent-entry' data-kind={entry.kind}>
					{entry.text}
				</div>
			);
		case 'thought':
			return (
				<details className='agent-entry' data-kind='thought'>
					<summary>{t('Thinking')}</summary>
					{entry.text}
				</details>
			);
		case 'tool':
			return (
				<div
					className='agent-entry'
					data-kind='tool'
					data-status={entry.status}
				>
					<span className='agent-tool-name'>{toolLabel(entry.title)}</span>
					<span className='agent-tool-status'>{entry.status}</span>
				</div>
			);
		case 'change':
			return <ChangeEntry entry={entry} />;
		case 'plan':
			return (
				<ol className='agent-entry' data-kind='plan'>
					{entry.items.map((item, index) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: plan items carry no ids and the agent replaces the whole plan on every update.
							key={index}
							data-status={item.status}
						>
							{item.content}
						</li>
					))}
				</ol>
			);
		case 'notice':
			return (
				<div className='agent-entry' data-kind='notice' data-tone={entry.tone}>
					{entry.text}
				</div>
			);
	}
};

const AgentPanel: React.FC = () => {
	const {
		agents,
		activeAgentId,
		setActiveAgentId,
		status,
		entries,
		send,
		cancel,
		newSession,
		chats,
		chatId,
		refreshChats,
		selectChat,
		deleteChat,
	} = useAgentSession();
	const { canDock, docked, setDocked } = useAgentDock();
	const [inputValue, setInputValue] = useState('');
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const endRef = useRef<HTMLDivElement>(null);
	const isBusy = status === 'prompting' || status === 'connecting';

	/* biome-ignore lint/correctness/useExhaustiveDependencies: entries is an intentional trigger; its change is the signal to scroll. */
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [entries]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: chatId is an intentional trigger; another chat cancels a pending delete.
	useEffect(() => {
		setConfirmingDelete(false);
	}, [chatId]);

	// The open chat is listed once it is first saved; until then it is shown
	// from the transcript.
	const isListed = chats.some((chat) => chat.id === chatId);

	const handleSend = () => {
		if (!inputValue.trim() || isBusy) return;
		void send(inputValue);
		setInputValue('');
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	return (
		<div className='agent-panel'>
			<div className='ui-toolbar agent-toolbar'>
				<span
					className='ui-status-dot'
					data-tone={STATUS_TONE[status]}
					title={status}
				/>
				{agents.length > 1 ? (
					<select
						className='ui-field-control'
						value={activeAgentId ?? ''}
						onChange={(e) => setActiveAgentId(e.target.value)}
						disabled={isBusy}
						aria-label={t('Agent')}
					>
						{agents.map((agent) => (
							<option key={agent.id} value={agent.id}>
								{agent.name}
							</option>
						))}
					</select>
				) : (
					<span className='agent-name'>{agents[0]?.name}</span>
				)}
				<select
					className='ui-field-control agent-chat-select'
					value={chatId ?? ''}
					onChange={(e) => {
						if (e.target.value) void selectChat(e.target.value);
						else newSession();
					}}
					onFocus={refreshChats}
					disabled={isBusy}
					aria-label={t('Chats')}
					title={t('Chats')}
				>
					{!chatId && <option value=''>{t('New chat')}</option>}
					{chatId && !isListed && (
						<option value={chatId}>
							{chatTitle(entries) || t('New chat')}
						</option>
					)}
					{chats.map((chat) => (
						<option key={chat.id} value={chat.id}>
							{`${chat.title || t('Untitled chat')} · ${formatDate(chat.updatedAt)}`}
						</option>
					))}
				</select>
				{chatId && isListed && (
					<button
						type='button'
						className={
							confirmingDelete
								? 'button danger agent-delete-chat'
								: 'ui-icon-button agent-delete-chat'
						}
						data-variant={confirmingDelete ? undefined : 'ghost'}
						data-size={confirmingDelete ? undefined : 'xs'}
						onClick={() => {
							if (confirmingDelete) void deleteChat(chatId);
							else setConfirmingDelete(true);
						}}
						onBlur={() => setConfirmingDelete(false)}
						disabled={isBusy}
						title={t('Delete this chat')}
						aria-label={
							confirmingDelete ? t('Confirm delete') : t('Delete this chat')
						}
					>
						{confirmingDelete ? t('Delete?') : <TrashIcon />}
					</button>
				)}
				<button
					type='button'
					className='button secondary agent-new-session'
					onClick={newSession}
					disabled={isBusy || entries.length === 0}
				>
					{t('New chat')}
				</button>
				{canDock && (
					<button
						type='button'
						className='ui-icon-button'
						data-variant='ghost'
						data-size='xs'
						onClick={() => setDocked(!docked)}
						title={docked ? t('Move to chat panel') : t('Open in side panel')}
						aria-label={
							docked ? t('Move to chat panel') : t('Open in side panel')
						}
					>
						{docked ? <MinimizeIcon /> : <ExpandIcon />}
					</button>
				)}
			</div>

			<div className='ui-list agent-transcript'>
				{entries.length === 0 ? (
					<div className='ui-empty-state'>
						<p>{t('Ask the agent to edit, fix, or compile this project.')}</p>
						<p className='agent-privacy'>
							{t(
								"Your messages and the files the agent reads are sent to the agent's AI provider. Every change needs your approval.",
							)}
						</p>
					</div>
				) : (
					entries.map((entry) => <Entry key={entry.id} entry={entry} />)
				)}
				<div ref={endRef} />
			</div>

			<div className='ui-toolbar' data-role='chat-input'>
				<textarea
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={t('Ask the agent...')}
					className='ui-field-control'
					data-role='chat-input'
					disabled={!activeAgentId}
					rows={1}
				/>
				{status === 'prompting' ? (
					<button type='button' onClick={cancel} className='button secondary'>
						{t('Stop')}
					</button>
				) : (
					<button
						type='button'
						onClick={handleSend}
						disabled={!inputValue.trim() || isBusy || !activeAgentId}
						className='button primary'
					>
						{t('Send')}
					</button>
				)}
			</div>
		</div>
	);
};

export default AgentPanel;
