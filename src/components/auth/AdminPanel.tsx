// src/components/auth/AdminPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import type { User, UserRole } from '../../types/auth';
import { UserIcon, TrashIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const {
    user: currentUser,
    adminCreateUser,
    adminDeleteUser,
    adminGetAllUsers,
    adminResetPassword,
  } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [isCreating, setIsCreating] = useState(false);

  // Reset password form
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  // Delete confirmation
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const allUsers = await adminGetAllUsers();
      setUsers(allUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to load users'));
    } finally {
      setIsLoading(false);
    }
  }, [adminGetAllUsers]);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newUsername || !newPassword) {
      setError(t('Username and password are required'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('Password must be at least 6 characters long'));
      return;
    }

    setIsCreating(true);
    try {
      await adminCreateUser(newUsername, newPassword, newEmail || undefined, newRole);
      setSuccess(t('User "{username}" created successfully', { username: newUsername }));
      setNewUsername('');
      setNewPassword('');
      setNewEmail('');
      setNewRole('user');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to create user'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setError(null);
    setSuccess(null);

    try {
      const userToDelete = users.find(u => u.id === userId);
      await adminDeleteUser(userId);
      setSuccess(t('User "{username}" deleted successfully', { username: userToDelete?.username || '' }));
      setDeleteUserId(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to delete user'));
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !resetPassword) return;

    setError(null);
    setSuccess(null);

    if (resetPassword.length < 6) {
      setError(t('Password must be at least 6 characters long'));
      return;
    }

    try {
      const targetUser = users.find(u => u.id === resetUserId);
      await adminResetPassword(resetUserId, resetPassword);
      setSuccess(t('Password reset for "{username}"', { username: targetUser?.username || '' }));
      setResetUserId(null);
      setResetPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to reset password'));
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return t('Never');
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('User Management')}
      icon={UserIcon}
      size="large">
      <div className="admin-panel">
        {error && <div className="admin-error">{error}</div>}
        {success && <div className="admin-success">{success}</div>}

        <div className="admin-section">
          <h3>{t('Create New User')}</h3>
          <form onSubmit={handleCreateUser} className="admin-create-form">
            <div className="admin-form-row">
              <div className="form-group">
                <label htmlFor="admin-new-username">{t('Username')}<span className="required">*</span></label>
                <input
                  type="text"
                  id="admin-new-username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  disabled={isCreating}
                  autoComplete="off" />
              </div>
              <div className="form-group">
                <label htmlFor="admin-new-email">{t('Email')}</label>
                <input
                  type="email"
                  id="admin-new-email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isCreating}
                  autoComplete="off" />
              </div>
            </div>
            <div className="admin-form-row">
              <div className="form-group">
                <label htmlFor="admin-new-password">{t('Password')}<span className="required">*</span></label>
                <input
                  type="password"
                  id="admin-new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isCreating}
                  autoComplete="new-password" />
              </div>
              <div className="form-group">
                <label htmlFor="admin-new-role">{t('Role')}</label>
                <select
                  id="admin-new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  disabled={isCreating}>
                  <option value="user">{t('User')}</option>
                  <option value="admin">{t('Admin')}</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="button primary"
              disabled={isCreating || !newUsername || !newPassword}>
              {isCreating ? t('Creating...') : t('Create User')}
            </button>
          </form>
        </div>

        <div className="admin-section">
          <h3>{t('Existing Users')} ({users.length})</h3>
          {isLoading ? (
            <p>{t('Loading users...')}</p>
          ) : (
            <div className="admin-users-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('Username')}</th>
                    <th>{t('Email')}</th>
                    <th>{t('Role')}</th>
                    <th>{t('Created')}</th>
                    <th>{t('Last Login')}</th>
                    <th>{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.id === currentUser?.id ? 'current-user-row' : ''}>
                      <td>
                        <span className="user-name">{u.username}</span>
                        {u.id === currentUser?.id && <span className="badge-you">{t('you')}</span>}
                      </td>
                      <td>{u.email || '-'}</td>
                      <td>
                        <span className={`role-badge role-${u.role || 'user'}`}>
                          {u.role || 'user'}
                        </span>
                      </td>
                      <td>{formatDate(u.createdAt)}</td>
                      <td>{formatDate(u.lastLogin)}</td>
                      <td className="actions-cell">
                        {u.id !== currentUser?.id && (
                          <>
                            <button
                              className="button small secondary"
                              onClick={() => { setResetUserId(u.id); setResetPassword(''); }}
                              title={t('Reset Password')}>
                              {t('Reset PW')}
                            </button>
                            <button
                              className="button small danger"
                              onClick={() => setDeleteUserId(u.id)}
                              title={t('Delete User')}>
                              <TrashIcon />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reset Password Dialog */}
        {resetUserId && (
          <div className="admin-inline-dialog">
            <h4>{t('Reset Password for "{username}"', { username: users.find(u => u.id === resetUserId)?.username || '' })}</h4>
            <form onSubmit={handleResetPassword} className="admin-inline-form">
              <div className="form-group">
                <label htmlFor="admin-reset-password">{t('New Password')}</label>
                <input
                  type="password"
                  id="admin-reset-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoComplete="new-password" />
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => { setResetUserId(null); setResetPassword(''); }}>
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!resetPassword}>
                  {t('Reset Password')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteUserId && (
          <div className="admin-inline-dialog danger">
            <h4>{t('Delete user "{username}"?', { username: users.find(u => u.id === deleteUserId)?.username || '' })}</h4>
            <p>{t('This will permanently delete the user and all their projects. This action cannot be undone.')}</p>
            <div className="admin-inline-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeleteUserId(null)}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => handleDeleteUser(deleteUserId)}>
                {t('Delete User')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AdminPanel;
