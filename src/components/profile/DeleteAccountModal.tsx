// src/components/profile/DeleteAccountModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { cleanupProjectDatabases } from '../../utils/dbDeleteUtils';
import { TrashIcon, ExportIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountDeleted: () => void;
  onOpenExport?: () => void;
}

const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountDeleted,
  onOpenExport
}) => {
  const { user, verifyPassword, getProjects } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expectedConfirmationText = `DELETE ${user?.username || ''}`;

  const handleDelete = async () => {
    if (!user) return;

    setIsDeleting(true);
    setError(null);

    try {
      if (!currentPassword) {
        throw new Error(t('Password is required to delete your account'));
      }

      if (confirmationText !== expectedConfirmationText) {
        throw new Error(t(`Please type \"{expectedConfirmationText}\" to confirm`, { expectedConfirmationText }));
      }

      const isPasswordValid = await verifyPassword(user.id, currentPassword);
      if (!isPasswordValid) {
        throw new Error(t('Incorrect password'));
      }

      await deleteUserAccount(user.id);
      onAccountDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to delete account'));
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteUserAccount = async (userId: string): Promise<void> => {
    // Get all user projects using the auth context
    const projects = await getProjects();

    // Clean up all project databases
    for (const project of projects) {
      await cleanupProjectDatabases(project);
    }

    // Import authService only for direct database access
    // This is needed because we need to delete from multiple stores in a transaction
    const { authService } = await import('../../services/AuthService');

    const authDb = authService.db;
    if (!authDb) {
      throw new Error(t('Database not available'));
    }

    // Delete all user data in a single transaction
    const tx = authDb.transaction(['projects', 'users'], 'readwrite');
    const projectStore = tx.objectStore('projects');
    const userStore = tx.objectStore('users');

    // Delete all user's projects from the database
    const userProjects = await projectStore.index('ownerId').getAll(userId);
    for (const project of userProjects) {
      await projectStore.delete(project.id);
    }

    // Delete the user record
    await userStore.delete(userId);
    await tx.done;

    // Clean up localStorage
    const userSettingsKey = `texlyre-user-${userId}-settings`;
    const userPropertiesKey = `texlyre-user-${userId}-properties`;
    const userSecretsKey = `texlyre-user-${userId}-secrets`;

    localStorage.removeItem(userSettingsKey);
    localStorage.removeItem(userPropertiesKey);
    localStorage.removeItem(userSecretsKey);
    localStorage.removeItem('texlyre-current-user');

    console.log(t(`Successfully deleted account for user: {userId}`, { userId }));
  };

  const handleOpenExport = () => {
    if (onOpenExport) {
      // Don't close the delete modal - keep it open so user can return to deletion
      onOpenExport();
    }
  };

  const handleClose = () => {
    setCurrentPassword('');
    setConfirmationText('');
    setError(null);
    setIsDeleting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('Delete Account')}
      icon={TrashIcon}
      size="medium">

      <div className="delete-account-container">
        {error && <div className="error-message">{error}</div>}

        <div className="warning-message">
          <h3>{t('\u26A0\uFE0F Warning: This action cannot be undone')}</h3>
          <p>{t('Deleting your account will permanently remove:')}

          </p>
          <ul>
            <li><strong>{t('All your projects')}</strong>{t('and their documents')}</li>
            <li><strong>{t('All project files')}</strong>{t('and folders')}</li>
            <li><strong>{t('All settings')}</strong>{t('and preferences')}</li>
            <li><strong>{t('All encrypted secrets')}</strong>{t('and API keys')}</li>
            <li><strong>{t('Your user profile')}</strong>{t('and login credentials')}</li>
          </ul>
          <p>
            <strong>{t('This data cannot be recovered after deletion.')}</strong>
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="current-password">{t('Enter your password to confirm')}

          </label>
          <input
            type="password"
            id="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={isDeleting}
            placeholder={t('Enter your password')} />

        </div>

        <div className="form-group">
          <label htmlFor="confirmation-text">{t('Type the following text to confirm:')}
            &nbsp;<strong>{expectedConfirmationText}</strong>
          </label>
          <input
            type="text"
            id="confirmation-text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            disabled={isDeleting}
            placeholder={expectedConfirmationText} />

        </div>

        <div className="export-reminder">
          <p>
            <strong>{t('Reminder: ')}</strong>{t('If you want to keep your data, use the')}{' '}
            {onOpenExport ?
              <button
                type="button"
                className="export-link-button"
                onClick={handleOpenExport}
                disabled={isDeleting}>

                <ExportIcon />{t('Export Account')}

              </button> :

              <strong>{t('Export Account')}</strong>
            }{' '}{t('option before deleting your account.')}

          </p>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={handleClose}
            disabled={isDeleting}>{t('Cancel')}


          </button>
          <button
            type="button"
            className="button danger"
            onClick={handleDelete}
            disabled={
              isDeleting ||
              !currentPassword ||
              confirmationText !== expectedConfirmationText
            }>

            {isDeleting ? t('Deleting Account...') : t('Delete Account')}
          </button>
        </div>
      </div>
    </Modal>);

};

export default DeleteAccountModal;