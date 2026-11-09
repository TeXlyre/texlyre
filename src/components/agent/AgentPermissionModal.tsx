// src/components/agent/AgentPermissionModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useAgentSession } from '../../hooks/useAgentSession';
import { applyUniqueEdit } from '../../services/ProjectFileSystem';
import type { ACPRequestPermissionRequest } from '../../types/acp';
import Modal from '../common/Modal';
import DiffView from './DiffView';
import { toolLabel } from './toolLabel';

type Preview =
	| { kind: 'diff'; path: string; before: string | null; after: string }
	| { kind: 'input'; text: string }
	| { kind: 'none' };

const asString = (value: unknown): string | null =>
	typeof value === 'string' ? value : null;

const buildPreview = async (
	request: ACPRequestPermissionRequest,
	readFile: (path: string) => Promise<string | null>,
): Promise<Preview> => {
	const input = request.toolCall.rawInput as
		| Record<string, unknown>
		| undefined;
	const name = toolLabel(String(request.toolCall.title ?? ''));
	const path = asString(input?.path);

	if (name === 'edit_file' && path) {
		const oldText = asString(input?.oldText) ?? '';
		const newText = asString(input?.newText) ?? '';
		const before = await readFile(path);
		if (before !== null) {
			try {
				return {
					kind: 'diff',
					path,
					before,
					after: applyUniqueEdit(before, oldText, newText, path),
				};
			} catch {
				// The edit will fail too; show what was asked for instead.
			}
		}
		return { kind: 'diff', path, before: oldText, after: newText };
	}

	if (name === 'write_file' && path) {
		return {
			kind: 'diff',
			path,
			before: await readFile(path),
			after: asString(input?.content) ?? '',
		};
	}

	if (input && Object.keys(input).length > 0) {
		return { kind: 'input', text: JSON.stringify(input, null, 2) };
	}
	return { kind: 'none' };
};

const AgentPermissionModal: React.FC = () => {
	const { pendingPermission, respondToPermission, readFile } =
		useAgentSession();
	// Keyed by request so a preview never shows against a later request.
	const [loaded, setLoaded] = useState<{ id: string; preview: Preview } | null>(
		null,
	);

	useEffect(() => {
		if (!pendingPermission) return;
		let stale = false;
		buildPreview(pendingPermission.request, readFile).then((preview) => {
			if (!stale) setLoaded({ id: pendingPermission.id, preview });
		});
		return () => {
			stale = true;
		};
	}, [pendingPermission, readFile]);

	if (!pendingPermission) return null;
	const preview: Preview =
		loaded?.id === pendingPermission.id ? loaded.preview : { kind: 'none' };
	const { toolCall, options } = pendingPermission.request;

	return (
		<Modal
			isOpen={true}
			onClose={() => respondToPermission(null)}
			title={t('Agent wants to use {{tool}}', {
				tool: toolLabel(String(toolCall.title ?? toolCall.toolCallId)),
			})}
			size='large'
			closeOnClickOutside={false}
		>
			<div className='agent-permission'>
				{preview.kind === 'diff' && (
					<>
						<p className='agent-permission-path'>
							{preview.before === null
								? t('Creates {{path}}', { path: preview.path })
								: t('Changes {{path}}', { path: preview.path })}
						</p>
						<DiffView before={preview.before} after={preview.after} />
					</>
				)}
				{preview.kind === 'input' && (
					<pre className='agent-permission-input'>{preview.text}</pre>
				)}

				<div className='ui-actions agent-permission-actions'>
					{options.map((option) => (
						<button
							key={option.optionId}
							type='button'
							className={
								option.kind === 'allow_once'
									? 'button primary'
									: 'button secondary'
							}
							onClick={() => respondToPermission(option.optionId)}
						>
							{option.name}
						</button>
					))}
				</div>
			</div>
		</Modal>
	);
};

export default AgentPermissionModal;
