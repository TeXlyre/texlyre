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
	if (offer.conflict.kind === 'same-id-different-config')
		return t('Replace mine');
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
										{offer.kind === 'typesetter'
											? t('Typesetter')
											: t('Language Server')}
									</span>
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
										{tool.kind === 'typesetter'
											? t('Typesetter')
											: t('Language Server')}
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
