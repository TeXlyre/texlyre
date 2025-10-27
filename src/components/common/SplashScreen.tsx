// src/components/common/SplashScreen.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useEffect, useState } from 'react';

import texlyreLogo from '../../assets/images/TeXlyre_notext.png';

interface SplashScreenProps {
  isVisible: boolean;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ isVisible }) => {
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setThemeLoaded(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`splash-screen ${themeLoaded ? 'theme-loaded' : ''}`}>
      <div className="splash-content">
        <div className="splash-logo">
          <img src={texlyreLogo} alt={t('TeXlyre')} />
        </div>
        <h1 className="splash-title">{t('TeXlyre')}</h1>
        <div className="splash-loading">
          <div className="loading-spinner" />
          <p>{t('Loading TeXlyre...')}</p>
        </div>
      </div>
    </div>);

};

export default SplashScreen;