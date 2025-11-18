// src/components/auth/Register.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import PasswordInfo from './PasswordInfo';
import { useAuth } from '../../hooks/useAuth';

interface RegisterProps {
  onRegisterSuccess: () => void;
  onSwitchToLogin: () => void;
  onShowPrivacy: () => void;
  isUpgrade?: boolean;
  upgradeFunction?: (username: string, password: string, email?: string) => Promise<any>;
}

const Register: React.FC<RegisterProps> = ({
  onRegisterSuccess,
  onSwitchToLogin,
  onShowPrivacy,
  isUpgrade = false,
  upgradeFunction
}) => {
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (email: string): boolean => {
    return /\S+@\S+\.\S+/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setError(t('Please fill out all required fields'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('Passwords do not match'));
      return;
    }

    if (password.length < 6) {
      setError(t('Password must be at least 6 characters long'));
      return;
    }

    if (email && !validateEmail(email)) {
      setError(t('Please enter a valid email address'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      if (isUpgrade && upgradeFunction) {
        await upgradeFunction(username, password, email || undefined);
      } else {
        await register(username, password, email || undefined);
      }
      onRegisterSuccess();
    } catch (err) {
      setError(
        err instanceof Error ?
          err.message :
          `An error occurred during ${isUpgrade ? 'upgrade' : 'registration'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <h2>{isUpgrade ? t('Upgrade to Full Account') : t('Create an Account')}</h2>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="username">{t('Username')}
            <span className="required">*</span>
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
            required />

        </div>

        <div className="form-group">
          <label htmlFor="email">{t('Email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            autoComplete="email" />

        </div>

        <div className="form-group">
          <PasswordInfo />
          <label htmlFor="password">{t('Password')}
            <span className="required">*</span>
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            required />

        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">{t('Confirm Password')}
            <span className="required">*</span>
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            required />

        </div>

        <button
          type="submit"
          className={`auth-button ${isLoading ? 'loading' : ''}`}
          disabled={!ageConfirmed || !privacyAccepted || isLoading}>

          {isLoading ? isUpgrade ? t('Upgrading...') : t('Creating Account...') : isUpgrade ? t('Upgrade Account') : t('Sign Up')}
        </button>
      </form>

      <div className="form-group">
        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            required />

          <span>{t('I confirm I am at least 16 years old')}</span>
        </label>
      </div>

      <div className="form-group">
        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            required />

          <span>{t('I understand how my data is handled as described in the')}
            {' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacy(); }}>{t('privacy information')}

            </a>
          </span>
        </label>
      </div>

      {!isUpgrade &&
        <div className="auth-alt-action">
          <span>{t('Already have an account?')}</span>
          <button
            className="text-button"
            onClick={onSwitchToLogin}
            disabled={isLoading}>{t('Login')}


          </button>
        </div>
      }
    </div>);

};

export default Register;