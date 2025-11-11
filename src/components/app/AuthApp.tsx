// src/components/app/AuthApp.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import texlyreLogo from '../../assets/images/TeXlyre_notext.png';
import { useTheme } from '../../hooks/useTheme';
import ImportAccount from '../auth/ImportAccount';
import Login from '../auth/Login';
import Register from '../auth/Register';
import PrivacyModal from '../common/PrivacyModal';
import ThemeToggleButton from '../settings/ThemeToggleButton';

interface AuthContainerProps {
  onAuthSuccess: () => void;
}

const AuthApp: React.FC<AuthContainerProps> = ({ onAuthSuccess }) => {
  const { currentThemePlugin, currentVariant } = useTheme();
  const [activeView, setActiveView] = useState<'login' | 'register' | 'import'>(
    'login'
  );
  const [showPrivacy, setShowPrivacy] = useState(false);

  const switchToLogin = () => {
    setActiveView('login');
  };

  const switchToRegister = () => {
    setActiveView('register');
  };

  const switchToImport = () => {
    setActiveView('import');
  };

  return (
    <div className={`auth-container ${currentThemePlugin?.id || 'default'}`}>
      <div className="auth-box">
        <div className="auth-header">
          <div className="auth-logo-wrapper">
            <img src={texlyreLogo} className="auth-logo" alt={t('TeXlyre logo')} />
          </div>
          <h1>{t('TeXlyre')}</h1>
          <ThemeToggleButton className="auth-theme-toggle" />
        </div>

        {activeView === 'login' ?
          <Login
            onLoginSuccess={onAuthSuccess}
            onSwitchToRegister={switchToRegister}
            onSwitchToImport={switchToImport} /> :

          activeView === 'register' ?
            <Register
              onRegisterSuccess={onAuthSuccess}
              onSwitchToLogin={switchToLogin}
              onShowPrivacy={() => setShowPrivacy(true)} /> :


            <ImportAccount
              onImportSuccess={onAuthSuccess}
              onSwitchToLogin={switchToLogin} />

        }

        <div className="auth-privacy-note">
          <p>{t('Your account and projects stay private in this browser. TeXlyre is')}<a href="https://www.inkandswitch.com/essay/local-first/" target="_blank" rel="noreferrer">{t('local-first')}</a>.</p>
        </div>
      </div>
      <footer className="auth-footer">
        <p className="read-the-docs">{t('Built with TeXlyre')}

          <a href="https://texlyre.github.io" target="_blank" rel="noreferrer">
            <img src={texlyreLogo} className="logo" alt={t('TeXlyre logo')} />
          </a>
          <span className="legal-links">
            <br /> <a href="https://texlyre.github.io/docs/intro" target="_blank" rel="noreferrer">{t('Documentation')}

            </a>
            {' '} • <a href="https://github.com/TeXlyre/texlyre" target="_blank" rel="noreferrer">{t('Source Code')}

            </a>
            {' '} • <a href="#" onClick={(event) => {
              event.preventDefault();
              setShowPrivacy(true);
            }} className="privacy-link">{t('Privacy')}</a>
          </span>
        </p>
      </footer>

      <PrivacyModal
        isOpen={showPrivacy}
        onClose={() => setShowPrivacy(false)} />


    </div>);


};

export default AuthApp;