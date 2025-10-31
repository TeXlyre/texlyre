// src/components/profile/ProfileSettingsModal.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useEffect, useState } from 'react';

import { type UserDataType, downloadUserData, clearUserData, importFromFile } from '../../utils/userDataUtils';
import { useAuth } from '../../hooks/useAuth';
import type { User } from '../../types/auth';
import Modal from '../common/Modal';
import { UserIcon, TrashIcon, DownloadIcon, ImportIcon } from '../common/Icons';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ClearType = 'settings' | 'properties' | 'secrets' | 'all';

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { user, updateUser, verifyPassword, updatePassword } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [color, setColor] = useState('');
  const [colorLight, setColorLight] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteType, setDeleteType] = useState<ClearType | null>(null);
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);

  const generateRandomColor = (isLight: boolean): string => {
    const hue = Math.floor(Math.random() * 360);
    const saturation = isLight ?
      60 + Math.floor(Math.random() * 20) :
      70 + Math.floor(Math.random() * 30);
    const lightness = isLight ?
      65 + Math.floor(Math.random() * 20) :
      45 + Math.floor(Math.random() * 25);

    const hslToHex = (h: number, s: number, l: number): string => {
      const sNorm = s / 100;
      const lNorm = l / 100;
      const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
      const x = c * (1 - Math.abs(h / 60 % 2 - 1));
      const m = lNorm - c / 2;

      let r = 0;
      let g = 0;
      let b = 0;
      if (0 <= h && h < 60) {
        r = c;
        g = x;
        b = 0;
      } else if (60 <= h && h < 120) {
        r = x;
        g = c;
        b = 0;
      } else if (120 <= h && h < 180) {
        r = 0;
        g = c;
        b = x;
      } else if (180 <= h && h < 240) {
        r = 0;
        g = x;
        b = c;
      } else if (240 <= h && h < 300) {
        r = x;
        g = 0;
        b = c;
      } else if (300 <= h && h < 360) {
        r = c;
        g = 0;
        b = x;
      }

      const toHex = (n: number) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
      };

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    return hslToHex(hue, saturation, lightness);
  };

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email || '');
      setColor(user.color || generateRandomColor(false));
      setColorLight(user.colorLight || generateRandomColor(true));
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (newPassword) {
        if (newPassword.length < 6) {
          throw new Error(t('New password must be at least 6 characters long'));
        }

        if (newPassword !== confirmPassword) {
          throw new Error(t('New passwords do not match'));
        }

        if (!currentPassword) {
          throw new Error(t('Current password is required to set a new password'));
        }

        const isCurrentPasswordValid = await verifyPassword(
          user.id,
          currentPassword
        );
        if (!isCurrentPasswordValid) {
          throw new Error(t('Current password is incorrect'));
        }

        await updatePassword(user.id, newPassword);
      }

      if (email && !/\S+@\S+\.\S+/.test(email)) {
        throw new Error(t('Please enter a valid email address'));
      }

      const updatedUser: User = {
        ...user,
        username,
        email: email || undefined,
        color,
        colorLight
      };

      if (!newPassword) {
        await updateUser(updatedUser);
      }

      setSuccessMessage(t('Profile updated successfully'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('An error occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadData = async (type: UserDataType) => {
    if (!user) return;

    try {
      await downloadUserData(user.id, type);
      const message = type === 'all' ? t('Downloaded all data') : t('Downloaded {type}', { type });
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to download data'));
    }
  };

  const handleOpenDeleteModal = (type: ClearType) => {
    setDeleteType(type);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteType(null);
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteType) return;

    try {
      setIsSubmitting(true);
      setError(null);

      await clearUserData(user.id, deleteType);

      const message = deleteType === 'all' ? t('Successfully cleared all data') : t('Successfully cleared {type}', { type: deleteType });
      setSuccessMessage(message);
      handleCloseDeleteModal();

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to clear data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.[0]) return;

    const file = e.target.files[0];
    if (!file.name.endsWith('.json')) {
      setError(t('Please select a valid JSON file'));
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await importFromFile(user.id, file);

      setSuccessMessage(t('Successfully imported user data'));
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to import data'));
    } finally {
      setIsSubmitting(false);
      e.target.value = '';
    }
  };

  const getDeleteModalContent = () => {
    if (!deleteType) return { title: '', message: '', items: [] };

    const content = {
      settings: {
        title: t('Clear Settings'),
        message: t('Are you sure you want to clear all your settings? This will reset all preferences to defaults.'),
        items: [
          t('All application preferences'),
          t('Editor configurations (font, saving interval, etc.)'),
          t('UI customizations and theme preferences (layout, variant, etc.)'),
          t('endpoints and server settings (links, connection configuration, etc.)')
        ]
      },
      properties: {
        title: t('Clear Properties'),
        message: t('Are you sure you want to clear all your properties? This will remove all stored property values.'),
        items: [
          t('All stored property values'),
          t('Application state data (last opened file, current line in editor, etc.)'),
          t('User-specific configurations (panel width, collapse, etc.)')
        ]
      },
      secrets: {
        title: t('Clear Encrypted Secrets'),
        message: t('Are you sure you want to clear all your encrypted secrets? This will permanently delete all saved API keys and credentials.'),
        items: [
          t('All API keys'),
          t('Encrypted credentials'),
          t('Authentication tokens (GitHub API key)')
        ]
      },
      all: {
        title: t('Clear All Local Storage'),
        message: t('Are you sure you want to clear ALL local storage data? This will remove settings, properties, and secrets permanently.'),
        items: [
          t('All application settings'),
          t('All stored properties'),
          t('All encrypted secrets'),
          t('All cached data')
        ]
      }
    };

    return content[deleteType];
  };

  const modalContent = getDeleteModalContent();

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('Profile Settings')}
        size="medium"
        icon={UserIcon}>

        <form onSubmit={handleSubmit} className="profile-form">
          {error && <div className="error-message">{error}</div>}

          {successMessage &&
            <div className="success-message">{successMessage}</div>
          }

          <div className="form-group">
            <label htmlFor="username">{t('Username')}</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting} />

          </div>

          <div className="form-group">
            <label htmlFor="email">{t('Email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting} />

          </div>

          <div className="color-picker-group">
            <label>{t('Cursor Colors')}</label>
            <div className="color-picker-row">
              <div className="form-group color-picker-item">
                <label htmlFor="color">{t('Dark Theme')}</label>
                <input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={isSubmitting} />

              </div>
              <div className="form-group color-picker-item">
                <label htmlFor="colorLight">{t('Light Theme')}</label>
                <input
                  type="color"
                  id="colorLight"
                  value={colorLight}
                  onChange={(e) => setColorLight(e.target.value)}
                  disabled={isSubmitting} />

              </div>
            </div>
          </div>

          <h3>{t('Change Password')}</h3>

          <div className="form-group">
            <label htmlFor="currentPassword">{t('Current Password')}</label>
            <input
              type="password"
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isSubmitting} />

          </div>

          <div className="form-group">
            <label htmlFor="newPassword">{t('New Password')}</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSubmitting} />

          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('Confirm New Password')}</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting} />

          </div>

          <h3>{t('Local Storage Data')}</h3>

          <div className="warning-message">
            <h3>{t('\u26A0\uFE0F Warning: This action cannot be undone')}</h3>
            <p>{t('Clearing or uploading local storage data is permanent and cannot be undone. Make sure to export your data before clearing if you want to keep it.')}
            </p>
            <p>{t('This does NOT delete your projects, files, and account data.')}
            </p>
          </div>

          <div className="local-storage-actions">
            <div className="storage-action-group">
              <div className="storage-action-info">
                <strong>{t('Settings')}</strong>
                <p>{t('All your application settings and preferences')}</p>
              </div>
              <div className="storage-action-buttons">
                <button
                  type="button"
                  className="button secondary smaller icon-only"
                  onClick={() => handleDownloadData('settings')}
                  disabled={isSubmitting}
                  title={t('Download settings data')}>

                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="button danger smaller icon-only"
                  onClick={() => handleOpenDeleteModal('settings')}
                  disabled={isSubmitting}
                  title={t('Clear settings')}>

                  <TrashIcon />
                </button>
              </div>
            </div>

            <div className="storage-action-group">
              <div className="storage-action-info">
                <strong>{t('Properties')}</strong>
                <p>{t('All stored property values')}</p>
              </div>
              <div className="storage-action-buttons">
                <button
                  type="button"
                  className="button secondary smaller icon-only"
                  onClick={() => handleDownloadData('properties')}
                  disabled={isSubmitting}
                  title={t('Download properties data')}>

                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="button danger smaller icon-only"
                  onClick={() => handleOpenDeleteModal('properties')}
                  disabled={isSubmitting}
                  title={t('Clear properties')}>

                  <TrashIcon />
                </button>
              </div>
            </div>

            <div className="storage-action-group">
              <div className="storage-action-info">
                <strong>{t('Encrypted Secrets')}</strong>
                <p>{t('All saved API keys and encrypted credentials')}</p>
              </div>
              <div className="storage-action-buttons">
                <button
                  type="button"
                  className="button secondary smaller icon-only"
                  onClick={() => handleDownloadData('secrets')}
                  disabled={isSubmitting}
                  title={t('Download secrets data')}>

                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="button danger smaller icon-only"
                  onClick={() => handleOpenDeleteModal('secrets')}
                  disabled={isSubmitting}
                  title={t('Clear secrets')}>

                  <TrashIcon />
                </button>
              </div>
            </div>

            <div className="storage-action-group danger-zone">
              <div className="storage-action-info">
                <strong>{t('All Local Storage Data')}</strong>
                <p>{t('All settings, properties, and secrets at once')}</p>
              </div>
              <div className="storage-action-buttons">
                <button
                  type="button"
                  className="button primary smaller icon-only"
                  onClick={() => fileInputRef?.click()}
                  disabled={isSubmitting}
                  title={t('Import all data')}>

                  <ImportIcon />
                </button>
                <input
                  ref={setFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  style={{ display: 'none' }}
                  disabled={isSubmitting} />

                <button
                  type="button"
                  className="button secondary smaller icon-only"
                  onClick={() => handleDownloadData('all')}
                  disabled={isSubmitting}
                  title={t('Download all data')}>

                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="button danger icon-only"
                  onClick={() => handleOpenDeleteModal('all')}
                  disabled={isSubmitting}
                  title={t('Clear all data')}>

                  <TrashIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={isSubmitting}>{t('Cancel')}


            </button>
            <button
              type="submit"
              className="button primary"
              disabled={isSubmitting}>

              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal >

      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title={modalContent.title}
        icon={TrashIcon}
        size="medium">

        <div className="clear-storage-modal">

          <div className="items-to-clear">
            <h4>{t('The following will be permanently removed:')}</h4>
            <ul>
              {modalContent.items.map((item, index) =>
                <li key={index}>{item}</li>
              )}
            </ul>
          </div>
          <div className="warning-message">
            <p>{t('This action cannot be undone.')}</p>
            <p>{modalContent.message}</p>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={handleCloseDeleteModal}
              disabled={isSubmitting}>{t('Cancel')}


            </button>
            <button
              type="button"
              className="button danger"
              onClick={handleConfirmDelete}
              disabled={isSubmitting}>

              {isSubmitting ? 'Clearing...' : `Clear ${deleteType === 'all' ? 'All Data' : deleteType}`}
            </button>
          </div>
        </div>
      </Modal>
    </>);

};

export default ProfileSettingsModal;