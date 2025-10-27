// src/components/auth/PasswordModal.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useEffect, useState } from 'react';

import { LockIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordSubmit: (password: string) => Promise<boolean>;
  message?: string;
  title?: string;
}

const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  onClose,
  onPasswordSubmit,
  message = 'Enter your TeXlyre password to access encrypted secrets:',
  title = 'Password Required'
}) => {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const success = await onPasswordSubmit(password);
      if (success) {
        onClose();
      } else {
        setError('Incorrect password');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      icon={LockIcon}
      size="small">

			<div className="password-modal">
				<p>{message}</p>

				{error && <div className="error-message">{error}</div>}

				<form onSubmit={handleSubmit} className="password-form">
					<div className="form-group">
						<label htmlFor="password">{t('Password')}</label>
						<input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="current-password" />

					</div>

					<div className="modal-actions">
						<button
              type="button"
              className="button secondary"
              onClick={handleClose}
              disabled={isSubmitting}>{t('Cancel')}


            </button>
						<button
              type="submit"
              className="button primary"
              disabled={isSubmitting || !password.trim()}>

							{isSubmitting ? 'Verifying...' : 'Unlock'}
						</button>
					</div>
				</form>
			</div>
		</Modal>);

};

export default PasswordModal;