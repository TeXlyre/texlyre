// src/components/editor/FileExplorerOptionsMenu.tsx
import type React from 'react';

import { t } from '@/i18n';
import type { FileSortDirection, FileSortField } from '../../utils/fileUtils';
import PositionedDropdown from '../common/PositionedDropdown';

interface FileExplorerOptionsMenuProps {
	isOpen: boolean;
	onClose: () => void;
	triggerElement: HTMLElement | null;
	sortField: FileSortField;
	sortDirection: FileSortDirection;
	onSortFieldChange: (field: FileSortField) => void;
	onSortDirectionChange: (direction: FileSortDirection) => void;
	showTemporaryFiles: boolean;
	onShowTemporaryFilesChange: (show: boolean) => void;
}

const FileExplorerOptionsMenu: React.FC<FileExplorerOptionsMenuProps> = ({
	isOpen,
	onClose,
	triggerElement,
	sortField,
	sortDirection,
	onSortFieldChange,
	onSortDirectionChange,
	showTemporaryFiles,
	onShowTemporaryFilesChange,
}) => (
	<PositionedDropdown
		isOpen={isOpen}
		triggerElement={triggerElement}
		className='file-toolbar-dropdown'
		align='right'
		onClose={onClose}
	>
		<div className='file-toolbar-content'>
			<div className='file-toolbar-section'>
				<div className='file-toolbar-label'>{t('Show')}</div>
				<select
					value={showTemporaryFiles ? 'all' : 'project'}
					onChange={(e) => onShowTemporaryFilesChange(e.target.value === 'all')}
					className='file-toolbar-select'
				>
					<option value='all'>{t('All Files')}</option>
					<option value='project'>{t('Project Files Only')}</option>
				</select>
			</div>

			<div className='file-toolbar-section'>
				<div className='file-toolbar-label'>{t('Sort')}</div>
				<div className='file-toolbar-sort-row'>
					<select
						value={sortField}
						onChange={(e) => onSortFieldChange(e.target.value as FileSortField)}
						className='file-toolbar-select file-toolbar-sort-field'
					>
						<option value='name'>{t('Name')}</option>
						<option value='modified'>{t('Date Modified')}</option>
						<option value='size'>{t('Size')}</option>
						<option value='type'>{t('Type')}</option>
					</select>
					<button
						className={`file-sort-order-toggle ${sortDirection === 'desc' ? 'desc' : ''}`}
						onClick={() =>
							onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')
						}
						title={sortDirection === 'asc' ? t('Ascending') : t('Descending')}
					>
						{sortDirection === 'asc' ? '↑' : '↓'}
					</button>
				</div>
			</div>
		</div>
	</PositionedDropdown>
);

export default FileExplorerOptionsMenu;
