// src/contexts/LanguageContext.tsx
import i18next from 'i18next';
import type React from 'react';
import { type ReactNode, createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSettings } from '../hooks/useSettings';
import languagesConfig from '../../translations/languages.config.json';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  coverage: number;
  totalKeys: number;
  translatedKeys: number;
  filePath: string;
}

interface LanguageContextType {
  currentLanguage: Language | null;
  availableLanguages: Language[];
  changeLanguage: (languageCode: string) => Promise<void>;
  isRTL: boolean;
}

export const LanguageContext = createContext<LanguageContextType>({
  currentLanguage: null,
  availableLanguages: [],
  changeLanguage: async () => { },
  isRTL: false
});

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const { getSetting } = useSettings();
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null);
  const [isRTL, setIsRTL] = useState(false);
  const availableLanguages = useMemo(() => languagesConfig.languages as Language[] || [], []);
  const lastAppliedLanguageRef = useRef<string | null>(null);

  const applyDirection = useCallback((direction: 'ltr' | 'rtl') => {
    document.documentElement.setAttribute('dir', direction);
    localStorage.setItem('text-direction', direction);
    setIsRTL(direction === 'rtl');
  }, []);

  const changeLanguage = useCallback(async (languageCode: string) => {
    const language = availableLanguages.find((lang) => lang.code === languageCode);
    if (!language) return;

    await i18next.changeLanguage(languageCode);
    setCurrentLanguage(language);

    // Dispatch custom event for settings to refresh plugin settings
    window.dispatchEvent(new CustomEvent('language-changed', {
      detail: { languageCode }
    }));
  }, [availableLanguages]);

  const languageCode = getSetting('language')?.value as string || 'en';
  const directionValue = getSetting('text-direction')?.value as string || 'auto';

  useEffect(() => {
    const initialLanguage =
      availableLanguages.find((lang) => lang.code === languageCode) || availableLanguages[0] || null;

    if (initialLanguage && currentLanguage?.code !== initialLanguage.code) {
      setCurrentLanguage(initialLanguage);
    }
  }, [availableLanguages, languageCode, currentLanguage]);

  useEffect(() => {
    if (!languageCode) return;
    if (lastAppliedLanguageRef.current === languageCode) return;

    lastAppliedLanguageRef.current = languageCode;
    changeLanguage(languageCode);
  }, [languageCode, changeLanguage]);

  useEffect(() => {
    if (!currentLanguage) return;

    requestAnimationFrame(() => {
      if (directionValue === 'auto') {
        applyDirection(currentLanguage.direction);
      } else {
        applyDirection(directionValue as 'ltr' | 'rtl');
      }
    });
  }, [currentLanguage, directionValue, applyDirection]);

  return (
    <LanguageContext.Provider value={{ currentLanguage, availableLanguages, changeLanguage, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};