// src/components/project/ShareProjectModal.tsx
import QRCode from 'qrcode';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { useCollab } from '../../hooks/useCollab';
import { useLSPConfig } from '../../hooks/useLSPConfig';
import { useSharedToolPreferences } from '../../hooks/useSharedToolPreferences';
import { useTypesetterConfig } from '../../hooks/useTypesetterConfig';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import type { DocumentList } from '../../types/documents';
import type { SharedLocalTool, SharedToolKind } from '../../types/sharedTools';
import type { ToolConfigBlock } from '../../types/toolConfig';
import {
	describeSharedToolAvailability,
	projectSharingKey,
} from '../../utils/sharedToolsUtils';
import { ShareIcon } from '../common/Icons';
import CopyField from '../common/CopyField';
import Modal from '../common/Modal';

interface ShareProjectModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectName: string;
	shareUrl: string;
}

const ShareProjectModal: React.FC<ShareProjectModalProps> = ({
	isOpen,
	onClose,
	projectName,
	shareUrl,
}) => {
	const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
	const { data: doc } = useCollab<DocumentList>();
	const typesetters = useTypesetterConfig();
	const lsps = useLSPConfig();
	const preferences = useSharedToolPreferences();
	const projectKey = projectSharingKey(shareUrl);
	const projectShareEnabled = preferences.isShareProjectTools(projectKey);

	const projectTools = useMemo(() => {
		const projectType = doc?.projectMetadata?.type ?? 'latex';
		const compilerId = doc?.projectMetadata?.compilerId;
		const provider = typesetterRegistryService.resolve(projectType, compilerId);
		const usedTypesetterId = provider?.source === 'chelys' ? provider.id : null;
		const usedLspIds = new Set(
			(doc?.documents ?? []).flatMap((document) =>
				lsps.getConfigsForFile(document.name).map((config) => config.id),
			),
		);

		const makeTool = (
			kind: SharedToolKind,
			config: ToolConfigBlock,
			usedByProject: boolean,
		): SharedLocalTool => {
			const share = describeSharedToolAvailability(config);
			return {
				kind,
				config,
				shareable: share.shareable,
				shareMessage: share.message,
				sharedWithAll: preferences.isSharedWithAll(kind, config.id),
				usedByProject,
			};
		};

		return [
			...typesetters.configs
				.filter((config) => config.enabled)
				.map((config) =>
					makeTool('typesetter', config, config.id === usedTypesetterId),
				),
			...lsps.configs
				.filter((config) => config.enabled)
				.map((config) => makeTool('lsp', config, usedLspIds.has(config.id))),
		];
	}, [
		doc?.documents,
		doc?.projectMetadata?.compilerId,
		doc?.projectMetadata?.type,
		typesetters.configs,
		lsps.configs,
		lsps.getConfigsForFile,
		preferences.isSharedWithAll,
	]);

	const globallySharedTools = projectTools.filter(
		(tool) => tool.sharedWithAll && tool.shareable,
	);
	const projectUsedTools = projectTools.filter((tool) => tool.usedByProject);
	const projectAdditionalTools = projectUsedTools.filter(
		(tool) => !tool.sharedWithAll,
	);
	const shareableProjectTools = projectAdditionalTools.filter(
		(tool) => tool.shareable,
	);
	const unavailableProjectTools = projectAdditionalTools.filter(
		(tool) => !tool.shareable,
	);
	const hasProjectTools = projectUsedTools.length > 0;

	useEffect(() => {
		if (isOpen && shareUrl) {
			QRCode.toDataURL(shareUrl, {
				width: 200,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff',
				},
			})
				.then(setQrCodeUrl)
				.catch(console.error);
		}
	}, [isOpen, shareUrl]);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Share Project')}
			icon={ShareIcon}
			size='medium'
		>
			<div className='ui-stack' data-gap='lg'>
				<div className='ui-stack' data-gap='xs'>
					<h4 className='ui-panel-title' data-size='body'>
						{t('Share "')}
						{projectName}"
					</h4>
					<p className='ui-meta'>
						{t(
							'Anyone with this link can view and collaborate on this project.',
						)}
					</p>
				</div>

				<div>
					<CopyField
						id='share-url'
						label={t('Project Link')}
						value={shareUrl}
					/>
				</div>

				<div
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					<label className='checkbox-control'>
						<input
							type='checkbox'
							checked={projectShareEnabled}
							disabled={!hasProjectTools}
							onChange={(event) =>
								preferences.setShareProjectTools(
									projectKey,
									event.target.checked,
								)
							}
						/>
						<span>{t('Share tools used in this project')}</span>
					</label>

					{projectShareEnabled && shareableProjectTools.length > 0 ? (
						<div className='ui-stack' data-gap='xs'>
							<strong>{t('Shared with this project')}</strong>
							<ul>
								{shareableProjectTools.map((tool) => (
									<li key={`${tool.kind}:${tool.config.id}`}>
										{tool.config.name} ·{' '}
										{tool.kind === 'typesetter'
											? t('Typesetter')
											: t('Language Server')}
									</li>
								))}
							</ul>
						</div>
					) : (
						<p className='ui-note'>
							{t('No additional project tools will be shared.')}
						</p>
					)}

					{globallySharedTools.length > 0 && (
						<div className='ui-stack' data-gap='xs'>
							<strong>{t('Already shared with all collaborators')}</strong>
							<ul>
								{globallySharedTools.map((tool) => (
									<li key={`${tool.kind}:${tool.config.id}`}>
										{tool.config.name} ·{' '}
										{tool.kind === 'typesetter'
											? t('Typesetter')
											: t('Language Server')}
									</li>
								))}
							</ul>
						</div>
					)}

					{projectShareEnabled && unavailableProjectTools.length > 0 && (
						<div className='ui-note ui-stack' data-gap='xs'>
							<strong>{t('Not shareable')}</strong>
							<ul>
								{unavailableProjectTools.map((tool) => (
									<li key={`${tool.kind}:${tool.config.id}`}>
										{tool.config.name}
										{tool.shareMessage ? ` — ${tool.shareMessage}` : ''}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>

				{qrCodeUrl && (
					<div className='ui-stack' data-gap='sm'>
						<label className='ui-field-label'>{t('QR Code')}</label>
						<div
							className='ui-card ui-stack'
							data-gap='sm'
							data-padding='md'
							data-surface='secondary'
							data-align='center'
						>
							<img
								className='project-share-qr'
								src={qrCodeUrl}
								alt={t('QR Code for project link')}
							/>
							<p className='ui-meta' data-align='center'>
								{t('Scan to open project on mobile')}
							</p>
						</div>
					</div>
				)}

				<div className='ui-message' data-tone='info'>
					<h5>{t('Sharing Tips')}</h5>
					<ul>
						<li>
							{t('All collaborators can edit documents and files in real-time')}
						</li>
						<li>{t('Changes are automatically saved and synchronized')}</li>
						<li>
							{t(
								'The project remains accessible as long as someone has the link',
							)}
						</li>
					</ul>
				</div>
			</div>
		</Modal>
	);
};

export default ShareProjectModal;
