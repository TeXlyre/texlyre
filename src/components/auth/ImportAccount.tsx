// src/components/auth/ImportAccount.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useState } from 'react';

import { accountExportService } from '../../services/AccountExportService';

interface ImportAccountProps {
  onImportSuccess: () => void;
  onSwitchToLogin: () => void;
}

const ImportAccount: React.FC<ImportAccountProps> = ({
  onImportSuccess,
  onSwitchToLogin
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError(t('Please select a file to import'));
      return;
    }

    if (!file.name.endsWith('.zip')) {
      setError(t('Please select a valid TeXlyre export file (.zip)'));
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      await accountExportService.importAccount(file);
      setSuccess(t('Account imported successfully!'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Error importing account'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRefresh = () => {
    onImportSuccess();
    window.location.reload();
  };

  return (
    <div className="import-account-container">
      <h3>{t('Import Account')}</h3>

      {error && <div className="error-message">{error}</div>}

      {success &&
        <div className="success-message">
          {success}{' '}
          <button
            type="button"
            className="refresh-import-button secondary"
            onClick={handleRefresh}>{t('Refresh page to access dashboard')}


          </button>
        </div>
      }

      {!success &&
        <>
          <form onSubmit={handleImport}>
            <div className="form-group">
              <label htmlFor="importFile">{t('Select account export file (.zip)')}</label>
              <input
                type="file"
                id="importFile"
                accept=".zip"
                onChange={handleFileChange}
                disabled={isImporting} />

            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={!file || isImporting}>

              {isImporting ? t('Importing...') : t('Import Account')}
            </button>
          </form>

          <div className="auth-alt-action">
            <span>{t('Back to login?')}</span>
            <button
              className="text-button"
              onClick={onSwitchToLogin}
              disabled={isImporting}>{t('Login')}


            </button>
          </div>
        </>
      }
    </div>);

};

export default ImportAccount;