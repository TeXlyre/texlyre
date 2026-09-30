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
		<div className='ui-menu-content'>
			<div className='ui-menu-section' data-gap='xs' data-divided='true'>
				<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
					{t('Show')}
				</div>
				<select
					value={showTemporaryFiles ? 'all' : 'project'}
					onChange={(e) => onShowTemporaryFilesChange(e.target.value === 'all')}
					className='ui-field-control ui-menu-control'
				>
					<option value='all'>{t('All Files')}</option>
					<option value='project'>{t('Project Files Only')}</option>
				</select>
			</div>

			<div className='ui-menu-section' data-gap='xs' data-divided='true'>
				<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
					{t('Sort')}
				</div>
				<div className='ui-menu-sort-row'>
					<select
						value={sortField}
						onChange={(e) => onSortFieldChange(e.target.value as FileSortField)}
						className='ui-field-control ui-menu-control ui-menu-sort-field'
					>
						<option value='name'>{t('Name')}</option>
						<option value='modified'>{t('Date Modified')}</option>
						<option value='size'>{t('Size')}</option>
						<option value='type'>{t('Type')}</option>
					</select>
					<button
						type='button'
						className={`ui-menu-sort-toggle ${sortDirection === 'desc' ? 'desc' : ''}`}
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
