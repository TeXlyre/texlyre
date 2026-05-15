// src/components/conflicts/ConflictResolutionModal.tsx
import { t } from '@/i18n';
import { useEffect, useState } from 'react';

import Modal from '../../components/common/Modal';
import {
	conflictResolutionService,
	type ConflictResolution,
	type ConflictResolutionRequest,
	type FileConflict,
} from '../../services/ConflictResolutionService';
import MergeEditor from './MergeEditor';

const toText = (content: string | ArrayBuffer): string =>
	typeof content === 'string' ? content : new TextDecoder().decode(content);

const ConflictResolutionModal: React.FC = () => {
	const [request, setRequest] = useState<ConflictResolutionRequest | null>(
		null,
	);
	const [index, setIndex] = useState(0);
	const [resolutions, setResolutions] = useState<
		Map<string, ConflictResolution>
	>(new Map());
	const [mergedContent, setMergedContent] = useState('');

	useEffect(() => {
		return conflictResolutionService.addListener((req) => {
			setRequest(req);
			setIndex(0);
			setResolutions(new Map());
		});
	}, []);

	if (!request) return null;

	const current: FileConflict = request.conflicts[index];
	const isLast = index === request.conflicts.length - 1;

	const recordAndAdvance = (resolution: ConflictResolution) => {
		const next = new Map(resolutions);
		next.set(current.path, resolution);
		setResolutions(next);
		setMergedContent('');

		if (isLast) {
			request.resolve(next);
			setRequest(null);
		} else {
			setIndex(index + 1);
		}
	};

	const handleCancel = () => {
		request.resolve(null);
		setRequest(null);
	};

	return (
		<Modal
			isOpen
			onClose={handleCancel}
			title={t('Resolve Conflicts ({current}/{total})', {
				current: index + 1,
				total: request.conflicts.length,
			})}
			size='wide'
			closeOnClickOutside={false}
		>
			<div className='conflict-resolution'>
				<div className='conflict-path'>{current.path}</div>

				{current.isBinary ? (
					<div className='conflict-binary-notice'>
						{t('Binary file. Choose which version to keep.')}
					</div>
				) : (
					<MergeEditor
						local={toText(current.localContent)}
						remote={toText(current.remoteContent)}
						onMergedChange={setMergedContent}
					/>
				)}

				<div className='conflict-actions'>
					<button
						className='button secondary'
						onClick={() => recordAndAdvance({ action: 'keep-local' })}
					>
						{t('Keep Local')}
					</button>
					<button
						className='button secondary'
						onClick={() => recordAndAdvance({ action: 'keep-remote' })}
					>
						{t('Keep Remote')}
					</button>
					{!current.isBinary && (
						<button
							className='button primary'
							onClick={() =>
								recordAndAdvance({ action: 'merged', content: mergedContent })
							}
							disabled={!mergedContent}
						>
							{isLast ? t('Finish') : t('Use Merged & Next')}
						</button>
					)}
					<button className='button secondary' onClick={handleCancel}>
						{t('Cancel Push')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ConflictResolutionModal;
