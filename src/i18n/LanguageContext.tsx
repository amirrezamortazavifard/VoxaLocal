import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppLanguage, translations } from './translations';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  dir: 'rtl' | 'ltr';
  t: (key: keyof typeof translations['fa']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem('voxlocal_ui_lang');
    return saved === 'en' ? 'en' : 'fa';
  });

  const dir: 'rtl' | 'ltr' = language === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    localStorage.setItem('voxlocal_ui_lang', language);
  }, [language, dir]);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
  };

  const t = (key: keyof typeof translations['fa']): string => {
    return translations[language][key] || translations['fa'][key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, dir, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
