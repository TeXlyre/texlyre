// src/components/settings/ToolConfigImport.tsx
import type React from 'react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import type { ToolConfigBlock, ToolConfigKind } from '../../types/toolConfig';
import { FileIcon, UploadIcon, UrlIcon } from '../common/Icons';
import { ToolConfigJsonEditor } from './ToolConfigForm';

interface ToolConfigImportProps {
	kind: ToolConfigKind;
	onImport: (configs: ToolConfigBlock[]) => void;
	onCancel: () => void;
}

type ImportSource = 'url' | 'json';

const ToolConfigImport: React.FC<ToolConfigImportProps> = ({
	kind,
	onImport,
	onCancel,
}) => {
	const dropRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [source, setSource] = useState<ImportSource | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [url, setUrl] = useState('');
	const [draft, setDraft] = useState('');
	const [isFetching, setIsFetching] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const applyText = (text: string) => {
		let parsed: unknown;

		try {
			parsed = JSON.parse(text);
		} catch {
			setError(t('The provided data is not valid JSON.'));
			return;
		}

		const entries = Array.isArray(parsed) ? parsed : [parsed];
		const configs = entries
			.map((entry) => kind.normalize(entry))
			.filter((config): config is ToolConfigBlock => config !== null);

		if (configs.length === 0) {
			setError(t('No valid recipe was found in the provided data.'));
			return;
		}

		setError(null);
		onImport(configs);
	};

	const handleFiles = async (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;

		try {
			applyText(await file.text());
		} catch {
			setError(t('The selected file could not be read.'));
		}
	};

	const handleUrlImport = async () => {
		if (!url.trim()) return;

		setIsFetching(true);
		setError(null);

		try {
			const response = await fetch(url.trim(), { cache: 'no-cache' });
			if (!response.ok) {
				throw new Error(String(response.status));
			}
			applyText(await response.text());
		} catch {
			setError(t('The recipe could not be fetched from that URL.'));
		} finally {
			setIsFetching(false);
		}
	};

	return (
		<div
			ref={dropRef}
			className={`tool-config-import${isDragging ? ' dragging' : ''}`}
			onDragOver={(e) => {
				e.preventDefault();
				setIsDragging(true);
			}}
			onDragLeave={(e) => {
				if (!dropRef.current?.contains(e.relatedTarget as Node)) {
					setIsDragging(false);
				}
			}}
			onDrop={(e) => {
				e.preventDefault();
				setIsDragging(false);
				void handleFiles(e.dataTransfer.files);
			}}
		>
			<div className='tool-config-import-options'>
				<label className='import-option-button'>
					<UploadIcon />
					<div>
						<strong>{t('From file')}</strong>
						<p>{t('Select or drop a JSON recipe file')}</p>
					</div>
					<input
						ref={fileInputRef}
						type='file'
						accept='.json,application/json'
						style={{ display: 'none' }}
						onChange={(e) => void handleFiles(e.target.files)}
					/>
				</label>

				<label
					className='import-option-button'
					onClick={() => setSource(source === 'url' ? null : 'url')}
				>
					<UrlIcon />
					<div>
						<strong>{t('From URL')}</strong>
						<p>{t('Fetch a recipe published as JSON')}</p>
					</div>
				</label>

				<label
					className='import-option-button'
					onClick={() => setSource(source === 'json' ? null : 'json')}
				>
					<FileIcon />
					<div>
						<strong>{t('Enter JSON')}</strong>
						<p>{t('Type or paste a recipe into the editor')}</p>
					</div>
				</label>
			</div>

			{error && <div className='error-message'>{error}</div>}

			{source === 'url' && (
				<div className='form-group'>
					<label htmlFor='tool-config-import-url'>{t('Recipe URL')}</label>
					<input
						id='tool-config-import-url'
						type='text'
						value={url}
						dir='ltr'
						placeholder='https://example.org/config.json'
						onChange={(e) => setUrl(e.target.value)}
					/>
					<button
						className='button primary'
						disabled={!url.trim() || isFetching}
						onClick={() => void handleUrlImport()}
					>
						{isFetching ? t('Fetching...') : t('Fetch')}
					</button>
				</div>
			)}

			{source === 'json' && (
				<div className='form-group'>
					<label>{t('Recipe JSON')}</label>
					<ToolConfigJsonEditor value={draft} height={10} onChange={setDraft} />
					<button
						className='button primary'
						disabled={!draft.trim()}
						onClick={() => applyText(draft)}
					>
						{t('Import')}
					</button>
				</div>
			)}

			<div className='form-actions'>
				<button className='button secondary' onClick={onCancel}>
					{t('Cancel')}
				</button>
			</div>
		</div>
	);
};

export default ToolConfigImport;
