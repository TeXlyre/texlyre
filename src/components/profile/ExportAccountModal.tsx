// src/components/profile/ExportAccountModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { accountExportService } from '../../services/AccountExportService';
import { useAuth } from '../../hooks/useAuth';
import { ExportIcon, ZipFileIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface ExportAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  showProjectSelection?: boolean;
}

const ExportAccountModal: React.FC<ExportAccountModalProps> = ({
  isOpen,
  onClose,
  showProjectSelection = true
}) => {
  const { user } = useAuth();
  const [exportScope, setExportScope] = useState<'current' | 'all'>('all');
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [includeTemporaryFiles, setIncludeTemporaryFiles] = useState(false);
  const [includeUserData, setIncludeUserData] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user) return;

    setIsExporting(true);
    setError(null);

    try {
      const exportAllProjects = exportScope === 'all';
      await accountExportService.exportAccount(user.id, exportAllProjects, includeUserData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setIsExporting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('Export Account')}
      icon={ZipFileIcon}
      size="medium">

      <div className="export-account-modal">
        {error && <div className="export-error-message">{error}</div>}

        <div className="export-info">
          <p>{t('Export your TeXlyre account data including projects, settings, and collaboration history.')}


          </p>
        </div>

        {showProjectSelection &&
          <div className="export-scope-selection">
            <h3>{t('Export Scope')}</h3>
            <div className="scope-options">
              <label className="scope-option">
                <input
                  type="radio"
                  name="exportScope"
                  value="current"
                  checked={exportScope === 'current'}
                  onChange={() => setExportScope('current')}
                  disabled={isExporting} />

                <span>{t('Current project only')}</span>
              </label>
              <label className="scope-option">
                <input
                  type="radio"
                  name="exportScope"
                  value="all"
                  checked={exportScope === 'all'}
                  onChange={() => setExportScope('all')}
                  disabled={isExporting} />

                <span>{t('All projects')}</span>
              </label>
            </div>
          </div>
        }

        <div className="export-option-group">
          <label className="export-option-label">
            <input
              type="checkbox"
              checked={includeDocuments}
              onChange={(e) => setIncludeDocuments(e.target.checked)}
              disabled={isExporting} />

            <span>{t('Include documents and collaboration data')}</span>
          </label>
          <label className="export-option-label">
            <input
              type="checkbox"
              checked={includeFiles}
              onChange={(e) => setIncludeFiles(e.target.checked)}
              disabled={isExporting} />

            <span>{t('Include project files')}</span>
          </label>
          <label className="export-option-label">
            <input
              type="checkbox"
              checked={includeTemporaryFiles}
              onChange={(e) => setIncludeTemporaryFiles(e.target.checked)}
              disabled={isExporting} />

            <span>{t('Include cache and temporary files')}</span>
          </label>
          <label className="export-option-label">
            <input
              type="checkbox"
              checked={includeUserData}
              onChange={(e) => setIncludeUserData(e.target.checked)}
              disabled={isExporting} />

            <span>{t('Include settings, properties, and encrypted secrets')}</span>
          </label>
        </div>

        <div className="export-note info-message">{t('Exported data can be imported into any TeXlyre installation to restore your complete workspace.')}


        </div>
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="button secondary"
          onClick={handleClose}
          disabled={isExporting}>{t('Cancel')}


        </button>
        <button
          type="button"
          className="button primary"
          onClick={handleExport}
          disabled={isExporting || !includeDocuments && !includeFiles}>

          {isExporting ?
            'Exporting...' :

            <>
              <ExportIcon />{t('Export Account')}

            </>
          }
        </button>
      </div>
    </Modal>);

};

export default ExportAccountModal;