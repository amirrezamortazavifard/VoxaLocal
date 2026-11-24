import React from 'react';
import {
  Mic,
  FileAudio,
  History,
  Cpu,
  Settings,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Globe,
} from 'lucide-react';
import { ModelInfo, RecognitionSettings } from '../types/asr';
import { useLanguage } from '../i18n/LanguageContext';

interface HeaderProps {
  activeTab: 'studio' | 'file' | 'history' | 'models' | 'settings';
  setActiveTab: (tab: 'studio' | 'file' | 'history' | 'models' | 'settings') => void;
  modelInfo: ModelInfo | null;
  settings: RecognitionSettings;
  onLanguageChange: (lang: 'fa' | 'en' | 'fa,en') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  modelInfo,
  settings,
  onLanguageChange,
}) => {
  const { language, setLanguage, t } = useLanguage();
  const isLoaded = modelInfo?.isLoaded;
  const isInstalled = modelInfo?.isInstalled;

  return (
    <header className="border-b border-slate-800/80 bg-navy-900/90 backdrop-blur-md px-6 py-2.5 flex items-center justify-between z-20 shadow-lg">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3.5 space-x-reverse">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-cyan-400 p-0.5 shadow-md shadow-cyan-500/20 flex items-center justify-center shrink-0">
          <div className="w-full h-full bg-navy-950 rounded-[10px] flex items-center justify-center">
            <Mic className="w-4.5 h-4.5 text-cyan-400" />
          </div>
        </div>
        <div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <h1 className="text-sm font-bold text-slate-100 tracking-wide font-sans">
              {t('appTitle')}
            </h1>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
              dir="ltr"
            >
              v1.0.1 Offline
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans line-clamp-1">
            {t('appSubtitle')}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center bg-navy-950/80 p-1 rounded-xl border border-slate-800/80 shadow-inner">
        <button
          onClick={() => setActiveTab('studio')}
          className={`flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'studio'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>{t('tabStudio')}</span>
        </button>

        <button
          onClick={() => setActiveTab('file')}
          className={`flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'file'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
        >
          <FileAudio className="w-3.5 h-3.5" />
          <span>{t('tabFile')}</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'history'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{t('tabHistory')}</span>
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'models'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{t('tabModels')}</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'settings'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{t('tabSettings')}</span>
        </button>
      </nav>

      {/* Right Controls: Unified Indicators */}
      <div className="flex items-center space-x-2.5 space-x-reverse">
        {/* Speech Recognition Mode Selector */}
        <div
          className="flex items-center bg-navy-950 rounded-lg p-0.5 border border-slate-800 text-[11px] shadow-inner font-mono"
          dir="ltr"
        >
          <button
            onClick={() => onLanguageChange('fa')}
            className={`px-2 py-0.5 rounded transition-colors ${settings.languageMode === 'fa'
              ? 'bg-cyan-500/20 text-cyan-300 font-bold'
              : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Persian recognition"
          >
            FA
          </button>
          <button
            onClick={() => onLanguageChange('en')}
            className={`px-2 py-0.5 rounded transition-colors ${settings.languageMode === 'en'
              ? 'bg-cyan-500/20 text-cyan-300 font-bold'
              : 'text-slate-400 hover:text-slate-200'
              }`}
            title="English recognition"
          >
            EN
          </button>
          <button
            onClick={() => onLanguageChange('fa,en')}
            className={`px-2 py-0.5 rounded transition-colors ${settings.languageMode === 'fa,en'
              ? 'bg-cyan-500/20 text-cyan-300 font-bold'
              : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Auto Persian + English recognition"
          >
            FA+EN
          </button>
        </div>

        {/* Model status pill */}
        <button
          onClick={() => setActiveTab('models')}
          className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-lg text-xs font-medium border bg-navy-950/80 transition-all hover:bg-slate-800/60 shadow-sm"
        >
          {isLoaded ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-300">{t('modelLoaded')}</span>
            </>
          ) : isInstalled ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-cyan-300">{t('modelReady')}</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-amber-300">{t('modelNotInstalled')}</span>
            </>
          )}
        </button>

        {/* UI Language Toggle (FA / EN) */}
        <button
          onClick={() => setLanguage(language === 'fa' ? 'en' : 'fa')}
          className="flex items-center space-x-1 space-x-reverse px-2 py-1 rounded-lg bg-navy-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition-colors"
          title="تغییر زبان محیط کاربری"
        >
          <Globe className="w-3 h-3 text-cyan-400" />
          <span className="font-mono">{language === 'fa' ? 'فارسی' : 'EN'}</span>
        </button>

        {/* 100% Offline Badge */}
        <div
          className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm"
          dir="ltr"
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>{t('offlineBadge')}</span>
        </div>
      </div>
    </header>
  );
};
