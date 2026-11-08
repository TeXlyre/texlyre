// src/components/collab/SharedToolsModal.tsx
import type React from 'react';

import { t } from '@/i18n';
import type {
	SharedByMeTool,
	SharedLocalTool,
	SharedToolKind,
	SharedToolOffer,
} from '../../types/sharedTools';
import { ShareIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface SharedToolsModalProps {
	isOpen: boolean;
	onClose: () => void;
	offers: SharedToolOffer[];
	sharedByMe: SharedByMeTool[];
	projectShareEnabled: boolean;
	onProjectShareChange: (enabled: boolean) => void;
	storageShareAvailable: boolean;
	storageShareEnabled: boolean;
	storageShareable: boolean;
	storageShareMessage?: string;
	onStorageShareChange: (enabled: boolean) => void;
	onAccept: (offer: SharedToolOffer) => void;
	onIgnore: (offer: SharedToolOffer) => void;
	agents?: SharedLocalTool[];
	onAgentShareChange?: (agentId: string, enabled: boolean) => void;
}

export const sharedToolKindLabel = (kind: SharedToolKind): string =>
	kind === 'typesetter'
		? t('Typesetter')
		: kind === 'lsp'
			? t('Language Server')
			: kind === 'agent'
				? t('Agent')
				: t('Storage');

const statusLabel = (offer: SharedToolOffer): string => {
	switch (offer.status) {
		case 'accepted':
			return t('Using');
		case 'ignored':
			return t('Ignored');
		case 'using-existing':
			return t('Using existing');
		default:
			return t('New');
	}
};

const acceptLabel = (offer: SharedToolOffer): string => {
	if (
		offer.kind !== 'storage' &&
		offer.conflict.kind === 'same-id-different-config'
	)
		return t('Replace mine');
	if (
		offer.conflict.kind === 'same-name' ||
		(offer.kind === 'storage' &&
			offer.conflict.kind === 'same-id-different-config')
	)
		return t('Add shared');
	return t('Use');
};

const ignoreLabel = (offer: SharedToolOffer): string =>
	(offer.kind !== 'storage' &&
		offer.conflict.kind === 'same-id-different-config') ||
	offer.conflict.kind === 'same-name'
		? t('Keep mine')
		: t('Ignore');

// Agents are shared one by one, so one isn't shared along with the project's
// other tools by accident. Used by the Share modal too.
export const AgentShareList: React.FC<{
	agents: SharedLocalTool[];
	onChange?: (agentId: string, enabled: boolean) => void;
}> = ({ agents, onChange }) => (
	<div className='ui-stack' data-gap='xs'>
		<strong>{t('Agents')}</strong>
		{agents.map((agent) => (
			<div className='ui-stack' data-gap='xs' key={agent.config.id}>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={agent.sharedInProject === true}
						disabled={!agent.shareable && !agent.sharedInProject}
						onChange={(event) =>
							onChange?.(agent.config.id, event.target.checked)
						}
					/>
					<span>
						{t('Share {{agent}} in this project', {
							agent: agent.config.name,
						})}
					</span>
				</label>
				{!agent.shareable && agent.shareMessage && (
					<span className='ui-note'>{t(agent.shareMessage)}</span>
				)}
			</div>
		))}
		<p className='ui-note'>
			{t('Collaborators connect directly to the agent through Chelys.')}
		</p>
	</div>
);

const SharedToolsModal: React.FC<SharedToolsModalProps> = ({
	isOpen,
	onClose,
	offers,
	sharedByMe,
	projectShareEnabled,
	onProjectShareChange,
	storageShareAvailable,
	storageShareEnabled,
	storageShareable,
	storageShareMessage,
	onStorageShareChange,
	onAccept,
	onIgnore,
	agents = [],
	onAgentShareChange,
}) => (
	<Modal
		isOpen={isOpen}
		onClose={onClose}
		title={t('Shared Tools')}
		icon={ShareIcon}
		size='medium'
	>
		<div className='ui-stack' data-gap='lg'>
			<section
				className='ui-card ui-stack'
				data-gap='sm'
				data-padding='md'
				data-surface='secondary'
			>
				<h4>{t('From collaborators')}</h4>
				{offers.length === 0 ? (
					<p className='ui-note'>
						{t('No collaborators are currently sharing tools.')}
					</p>
				) : (
					<div className='ui-list' data-gap='sm'>
						{offers.map((offer) => (
							<div
								className='ui-list-item'
								data-align='center'
								data-justify='between'
								data-gap='md'
								data-padding='sm'
								data-responsive='stack'
								key={offer.identity}
							>
								<div className='ui-stack' data-gap='xs'>
									<strong>{offer.name}</strong>
									<span className='ui-note'>
										{offer.ownerName}
										{offer.advertiserId !== offer.ownerId
											? ` · ${t('via')} ${offer.advertiserName}`
											: ''}
										{' · '}
										{sharedToolKindLabel(offer.kind)}
									</span>
									{offer.kind === 'agent' && (
										<span className='ui-note'>
											{t(
												"Runs on {{owner}}'s computer with their account, while they share it.",
												{ owner: offer.ownerName },
											)}
										</span>
									)}
								</div>
								<div className='ui-actions' data-wrap='true'>
									<span
										className='ui-status'
										data-tone={
											offer.status === 'accepted' ||
											offer.status === 'using-existing'
												? 'success'
												: offer.status === 'ignored'
													? 'muted'
													: 'warning'
										}
									>
										{statusLabel(offer)}
									</span>
									{offer.status === 'accepted' && (
										<button
											type='button'
											className='button secondary '
											onClick={() => onIgnore(offer)}
										>
											{t('Ignore')}
										</button>
									)}
									{offer.status === 'ignored' && (
										<button
											type='button'
											className='button primary '
											onClick={() => onAccept(offer)}
										>
											{acceptLabel(offer)}
										</button>
									)}
									{offer.status === 'new' && (
										<>
											<button
												type='button'
												className='button primary '
												onClick={() => onAccept(offer)}
											>
												{acceptLabel(offer)}
											</button>
											<button
												type='button'
												className='button secondary '
												onClick={() => onIgnore(offer)}
											>
												{ignoreLabel(offer)}
											</button>
										</>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			<section
				className='ui-card ui-stack'
				data-gap='sm'
				data-padding='md'
				data-surface='secondary'
			>
				<h4>{t('Shared by me')}</h4>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={projectShareEnabled}
						onChange={(event) => onProjectShareChange(event.target.checked)}
					/>
					<span>{t('Share tools used in this project')}</span>
				</label>

				{storageShareAvailable && (
					<>
						<label className='checkbox-control'>
							<input
								type='checkbox'
								checked={storageShareEnabled}
								disabled={!storageShareable}
								onChange={(event) => onStorageShareChange(event.target.checked)}
							/>
							<span>{t('Share storage with collaborators')}</span>
						</label>
						{!storageShareable && storageShareMessage && (
							<p className='ui-note'>{storageShareMessage}</p>
						)}
					</>
				)}

				{agents.length > 0 && (
					<AgentShareList agents={agents} onChange={onAgentShareChange} />
				)}

				{sharedByMe.length === 0 ? (
					<p className='ui-note'>{t('No tools are shared here.')}</p>
				) : (
					<div className='ui-list' data-gap='sm'>
						{sharedByMe.map((tool) => (
							<div
								className='ui-list-item'
								data-align='center'
								data-justify='between'
								data-gap='md'
								data-padding='xs'
								data-responsive='stack'
								key={`${tool.kind}:${tool.config.id}`}
							>
								<div className='ui-stack' data-gap='xs'>
									<strong>{tool.config.name}</strong>
									<span className='ui-note'>
										{sharedToolKindLabel(tool.kind)}
									</span>
								</div>
								<span className='ui-note'>
									{tool.scope === 'all'
										? t('All collaborators')
										: t('This project')}
								</span>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	</Modal>
);

export default SharedToolsModal;
