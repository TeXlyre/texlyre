// src/components/auth/Login.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({
  onLoginSuccess,
}) => {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setError(t('Please enter both username and password'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await login(username, password);
      onLoginSuccess();
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('An error occurred during login')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <h2>{t('Login')}</h2>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="username">{t('Username')}</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoComplete="username" />
        </div>

        <div className="form-group">
          <label htmlFor="password">{t('Password')}</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password" />
        </div>

        <button
          type="submit"
          className={`auth-button ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}>
          {isLoading ? t('Logging in...') : t('Login')}
        </button>
      </form>

      <div className="auth-enterprise-note">
        <p>{t('Contact your administrator for account access.')}</p>
      </div>
    </div>
  );
};

export default Login;
