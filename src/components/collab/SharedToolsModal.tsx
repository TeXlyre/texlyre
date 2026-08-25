import type React from 'react';

import { t } from '@/i18n';
import type { SharedByMeTool, SharedToolOffer } from '../../types/sharedTools';
import { ShareIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface SharedToolsModalProps {
	isOpen: boolean;
	onClose: () => void;
	offers: SharedToolOffer[];
	sharedByMe: SharedByMeTool[];
	projectShareEnabled: boolean;
	onProjectShareChange: (enabled: boolean) => void;
	onAccept: (offer: SharedToolOffer) => void;
	onIgnore: (offer: SharedToolOffer) => void;
}

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
	if (offer.conflict.kind === 'same-id-different-config') return t('Replace mine');
	if (offer.conflict.kind === 'same-name') return t('Add shared');
	return t('Use');
};

const ignoreLabel = (offer: SharedToolOffer): string =>
	offer.conflict.kind === 'same-id-different-config' ||
	offer.conflict.kind === 'same-name'
		? t('Keep mine')
		: t('Ignore');

const SharedToolsModal: React.FC<SharedToolsModalProps> = ({
	isOpen,
	onClose,
	offers,
	sharedByMe,
	projectShareEnabled,
	onProjectShareChange,
	onAccept,
	onIgnore,
}) => (
	<Modal
		isOpen={isOpen}
		onClose={onClose}
		title={t('Shared Tools')}
		icon={ShareIcon}
		size='medium'
	>
		<div className='shared-tools-modal'>
			<section className='shared-tools-section'>
				<h4>{t('From collaborators')}</h4>
				{offers.length === 0 ? (
					<p className='shared-tools-empty'>
						{t('No collaborators are currently sharing tools.')}
					</p>
				) : (
					<div className='shared-tools-list'>
						{offers.map((offer) => (
							<div className='shared-tool-row' key={offer.identity}>
								<div className='shared-tool-info'>
									<strong>{offer.name}</strong>
									<span>
										{offer.ownerName}
										{offer.advertiserId !== offer.ownerId
											? ` · ${t('via')} ${offer.advertiserName}`
											: ''}
										{' · '}
										{offer.kind === 'typesetter'
											? t('Typesetter')
											: t('Language Server')}
									</span>
								</div>
								<div className='shared-tool-actions'>
									<span className={`shared-tool-status ${offer.status}`}>
										{statusLabel(offer)}
									</span>
									{offer.status === 'accepted' && (
										<button
											className='button secondary smaller'
											onClick={() => onIgnore(offer)}
										>
											{t('Ignore')}
										</button>
									)}
									{offer.status === 'ignored' && (
										<button
											className='button primary smaller'
											onClick={() => onAccept(offer)}
										>
											{acceptLabel(offer)}
										</button>
									)}
									{offer.status === 'new' && (
										<>
											<button
												className='button primary smaller'
												onClick={() => onAccept(offer)}
											>
												{acceptLabel(offer)}
											</button>
											<button
												className='button secondary smaller'
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

			<section className='shared-tools-section'>
				<h4>{t('Shared by me')}</h4>
				<label className='checkbox-control shared-project-tools-toggle'>
					<input
						type='checkbox'
						checked={projectShareEnabled}
						onChange={(event) => onProjectShareChange(event.target.checked)}
					/>
					<span>{t('Share tools used in this project')}</span>
				</label>

				{sharedByMe.length === 0 ? (
					<p className='shared-tools-empty'>{t('No tools are shared here.')}</p>
				) : (
					<div className='shared-tools-list'>
						{sharedByMe.map((tool) => (
							<div
								className='shared-tool-row compact'
								key={`${tool.kind}:${tool.config.id}`}
							>
								<div className='shared-tool-info'>
									<strong>{tool.config.name}</strong>
									<span>
										{tool.kind === 'typesetter'
											? t('Typesetter')
											: t('Language Server')}
									</span>
								</div>
								<span className='shared-tool-scope'>
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
