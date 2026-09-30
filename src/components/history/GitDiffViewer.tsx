// src/components/history/GitDiffViewer.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import type { GitComparisonFile } from '../../services/GitService';
import { stripAnnotationTagsWithSpans } from '../../utils/annotationTagUtils';
import { SaveIcon } from '../common/Icons';
import { PluginControlGroup, PluginHeader } from '../common/PluginHeader';
import MergeEditor, {
	type MergeEditorHandle,
	type MergeEmptySideNote,
} from '../conflicts/MergeEditor';

export interface GitDiffView {
	file: GitComparisonFile;
	leftLabel: string;
	rightLabel: string;
	key: string;
	editable?: boolean;
	onSave?: (content: string) => Promise<void>;
}

interface GitDiffViewerProps {
	view: GitDiffView;
}

const statusLabel = (type: GitComparisonFile['type']): string => {
	if (type === 'added') return 'A';
	if (type === 'deleted') return 'D';
	return 'M';
};

const GitDiffViewer: React.FC<GitDiffViewerProps> = ({ view }) => {
	const { file } = view;
	const editorRef = useRef<MergeEditorHandle>(null);
	const [dirty, setDirty] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(view.key): Diff identity intentionally resets local save state. */
	useEffect(() => {
		setDirty(false);
		setIsSaving(false);
		setSaveError(null);
	}, [view.key]);

	const save = async (content?: string) => {
		if (!view.editable || !view.onSave || file.isBinary || isSaving) return;
		const merged = content ?? editorRef.current?.getMergedContent() ?? '';
		setIsSaving(true);
		setSaveError(null);
		try {
			await view.onSave(merged);
			setDirty(false);
		} catch (error) {
			setSaveError(
				error instanceof Error ? error.message : t('Failed to save file'),
			);
		} finally {
			setIsSaving(false);
		}
	};
	const left = file.isBinary
		? null
		: stripAnnotationTagsWithSpans(file.leftContent as string);
	const right = file.isBinary
		? null
		: stripAnnotationTagsWithSpans(file.rightContent as string);
	const emptySide: 'a' | 'b' | null =
		file.type === 'modified'
			? null
			: view.editable
				? file.type === 'added'
					? 'b'
					: 'a'
				: file.type === 'added'
					? 'a'
					: 'b';
	const emptySideNote: MergeEmptySideNote | undefined = emptySide
		? {
				side: emptySide,
				text: `${t('Empty')} — ${
					emptySide === 'a' ? view.leftLabel : view.rightLabel
				}`,
			}
		: undefined;

	return (
		<div className='git-diff-viewer'>
			<PluginHeader
				fileName={file.path}
				filePath={file.path}
				alwaysVisible
				pathPrefix={
					<code className={`git-change-status ${file.type}`}>
						{statusLabel(file.type)}
					</code>
				}
				controls={
					<>
						<div className='git-diff-refs'>
							<code>{view.rightLabel}</code>
							<span aria-hidden='true'>↔</span>
							<code>{view.leftLabel}</code>
						</div>
						{view.editable && !file.isBinary && (
							<PluginControlGroup>
								<button
									type='button'
									title={t('Save File (Ctrl+S)')}
									aria-label={t('Save File')}
									onClick={() => void save()}
									disabled={!dirty || isSaving}
								>
									<SaveIcon />
								</button>
							</PluginControlGroup>
						)}
					</>
				}
			/>

			{file.isBinary ? (
				<div className='git-diff-binary'>
					<strong>{t('Binary file changed')}</strong>
					<span>
						{t('This file differs between {left} and {right}.', {
							left: view.leftLabel,
							right: view.rightLabel,
						})}
					</span>
				</div>
			) : (
				<MergeEditor
					ref={editorRef}
					key={view.key}
					fileName={file.path}
					local={left?.content ?? ''}
					remote={right?.content ?? ''}
					localAnnotationSpans={left?.spans}
					annotationSpans={right?.spans}
					localReviewDeletions={left?.reviewDeletions}
					reviewDeletions={right?.reviewDeletions}
					emptySideNote={emptySideNote}
					onMergedChange={view.editable ? () => setDirty(true) : undefined}
					onSave={view.editable ? (content) => void save(content) : undefined}
					readOnly={!view.editable}
				/>
			)}
			{saveError && (
				<div className='ui-message' data-tone='error' data-density='compact'>
					{saveError}
				</div>
			)}
		</div>
	);
};

export default GitDiffViewer;
