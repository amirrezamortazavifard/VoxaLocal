import React, { useState } from 'react';
import {
  Home,
  Sliders,
  BookA,
  Sparkles,
  AlignLeft,
  Mic,
  Keyboard,
  Cpu,
  ArrowUpDown,
  Info,
  ChevronDown,
  ChevronRight,
  FileText,
  Bug,
  RefreshCw,
  Globe,
  FileAudio,
  History,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLanguage } from '../../i18n/LanguageContext';

export type DashboardTab =
  | 'home'
  | 'dictionary'
  | 'rules'
  | 'llm'
  | 'voice_mode'
  | 'shortcuts'
  | 'system'
  | 'import_export'
  | 'file_transcribe'
  | 'full_history'
  | 'about';

interface SidebarProps {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { t, language, setLanguage } = useLanguage();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [customOpen, setCustomOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);

  const handleOpenGitHub = async () => {
    try {
      await openUrl('https://github.com/amirrezamortazavifard/VoxaLocal');
    } catch (err) {
      console.error('Failed to open link:', err);
    }
  };

  const handleOpenIssues = async () => {
    try {
      await openUrl('https://github.com/amirrezamortazavifard/VoxaLocal/issues');
    } catch (err) {
      console.error('Failed to open link:', err);
    }
  };

  return (
    <aside
      className={`${
        isCollapsed ? 'w-14' : 'w-56'
      } bg-[#141518] border-e border-white/[0.08] flex flex-col justify-between h-full select-none text-slate-300 font-sans shrink-0 transition-all duration-200`}
    >
      {/* Top Branding & Logo */}
      <div className="flex flex-col flex-1 min-h-0">
        {isCollapsed ? (
          <div className="p-2.5 flex flex-col items-center justify-center border-b border-white/[0.06] shrink-0 space-y-1.5">
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 p-[2px] shadow-lg shadow-cyan-500/20 hover:scale-105 transition-transform cursor-pointer"
              title={language === 'fa' ? 'گسترش منوی سایدبار' : 'Expand Sidebar'}
            >
              <div className="w-full h-full bg-[#141518] rounded-full flex items-center justify-center">
                <svg
                  className="w-3.5 h-3.5 text-cyan-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 11v2M22 12h-2" />
                </svg>
              </div>
            </button>
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-1 rounded-md text-slate-400 hover:text-cyan-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
              title={language === 'fa' ? 'گسترش منو' : 'Expand Menu'}
            >
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="p-3.5 flex items-center justify-between border-b border-white/[0.06] shrink-0">
            <div className="flex items-center space-x-2.5 space-x-reverse min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 p-[2px] shadow-lg shadow-cyan-500/20 shrink-0">
                <div className="w-full h-full bg-[#141518] rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-cyan-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 11v2M22 12h-2" />
                  </svg>
                </div>
              </div>
              <div className="truncate">
                <h1 className="text-sm font-bold text-white tracking-wide truncate">VoxaLocal</h1>
                <p className="text-[10px] text-slate-400 font-mono" dir="ltr">
                  v1.0.1 Offline
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              title={language === 'fa' ? 'جمع کردن منو' : 'Collapse Sidebar'}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Sections */}
        {isCollapsed ? (
          <nav className="py-2 px-1.5 space-y-1 text-xs flex-1 overflow-y-auto flex flex-col items-center">
            {/* 1. Home */}
            <button
              onClick={() => setActiveTab('home')}
              title={t('tabHome')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <Home className="w-4 h-4" />
            </button>

            <div className="w-5 h-[1px] bg-white/[0.08] my-1" />

            {/* Customization items */}
            <button
              onClick={() => setActiveTab('dictionary')}
              title={t('tabDictionary')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'dictionary'
                  ? 'bg-indigo-500/20 text-indigo-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <BookA className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              title={t('tabFormattingRules')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'rules'
                  ? 'bg-blue-500/20 text-blue-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <AlignLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('llm')}
              title={t('tabLlmConnection')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'llm'
                  ? 'bg-amber-500/20 text-amber-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('voice_mode')}
              title={t('tabVoiceMode')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'voice_mode'
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>

            <div className="w-5 h-[1px] bg-white/[0.08] my-1" />

            {/* Settings items */}
            <button
              onClick={() => setActiveTab('shortcuts')}
              title={t('tabShortcuts')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'shortcuts'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <Keyboard className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('system')}
              title={t('tabSystem')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'system'
                  ? 'bg-rose-500/20 text-rose-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <Cpu className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('import_export')}
              title={t('tabImportExport')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'import_export'
                  ? 'bg-teal-500/20 text-teal-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('file_transcribe')}
              title={t('tabFileTranscription')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'file_transcribe'
                  ? 'bg-amber-500/20 text-amber-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <FileAudio className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('full_history')}
              title={t('tabFullHistory')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'full_history'
                  ? 'bg-purple-500/20 text-purple-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <History className="w-4 h-4" />
            </button>

            <div className="w-5 h-[1px] bg-white/[0.08] my-1" />

            {/* About item */}
            <button
              onClick={() => setActiveTab('about')}
              title={t('tabAbout')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'about'
                  ? 'bg-white/[0.12] text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <Info className="w-4 h-4" />
            </button>
          </nav>
        ) : (
          <nav className="p-2.5 space-y-1 text-xs flex-1 overflow-y-auto">
            {/* 1. Accueil / Home */}
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-white/[0.08] text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <Home className="w-4 h-4 text-cyan-400" />
              <span>{t('tabHome')}</span>
            </button>

            {/* 2. Personnaliser / Customize Section */}
            <div className="pt-2">
              <button
                onClick={() => setCustomOpen(!customOpen)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider"
              >
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('groupCustomize')}</span>
                </div>
                {customOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {customOpen && (
                <div className="mt-1 space-y-0.5 ps-3">
                  <button
                    onClick={() => setActiveTab('dictionary')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'dictionary'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <BookA className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('tabDictionary')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('rules')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'rules'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t('tabFormattingRules')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('llm')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'llm'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('tabLlmConnection')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('voice_mode')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'voice_mode'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('tabVoiceMode')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Paramètres / Settings Section */}
            <div className="pt-2">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider"
              >
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('groupSettings')}</span>
                </div>
                {settingsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {settingsOpen && (
                <div className="mt-1 space-y-0.5 ps-3">
                  <button
                    onClick={() => setActiveTab('shortcuts')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'shortcuts'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{t('tabShortcuts')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('system')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'system'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5 text-rose-400" />
                    <span>{t('tabSystem')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('import_export')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'import_export'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-teal-400" />
                    <span>{t('tabImportExport')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('file_transcribe')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'file_transcribe'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <FileAudio className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('tabFileTranscription')}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('full_history')}
                    className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'full_history'
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-purple-400" />
                    <span>{t('tabFullHistory')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4. À propos / About */}
            <div className="pt-2">
              <button
                onClick={() => setActiveTab('about')}
                className={`w-full flex items-center space-x-2.5 space-x-reverse px-3 py-2 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'about'
                    ? 'bg-white/[0.08] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <Info className="w-4 h-4 text-cyan-400" />
                <span>{t('tabAbout')}</span>
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* Bottom Sidebar Footer */}
      {isCollapsed ? (
        <div className="p-2 border-t border-white/[0.06] flex flex-col items-center space-y-2">
          {/* Compact language switch button */}
          <button
            onClick={() => setLanguage(language === 'fa' ? 'en' : 'fa')}
            className="w-8 h-8 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20 transition-all cursor-pointer"
            title={language === 'fa' ? 'تغییر به English' : 'Switch to Persian'}
          >
            {language === 'fa' ? 'فا' : 'EN'}
          </button>
        </div>
      ) : (
        <div className="p-3 border-t border-white/[0.06] space-y-1 text-xs">
          <button
            onClick={handleOpenGitHub}
            className="w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('releaseNotes')}</span>
          </button>

          <button
            onClick={handleOpenIssues}
            className="w-full flex items-center space-x-2.5 space-x-reverse px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5" />
            <span>{t('reportBug')}</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-slate-500 hover:bg-white/[0.04] hover:text-slate-200 text-[11px] transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2 space-x-reverse">
              <RefreshCw className="w-3 h-3 text-emerald-400" />
              <span className="text-slate-400">{t('checkUpdates')}</span>
            </div>
            <span className="font-mono text-[10px] text-slate-500">v1.0.1</span>
          </button>

          {/* Language Switcher Pill */}
          <div className="pt-2 flex items-center justify-between px-2">
            <div className="flex items-center space-x-1.5 space-x-reverse text-[11px] text-slate-400">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{language === 'fa' ? 'فارسی' : 'English'}</span>
            </div>
            <div className="flex bg-[#1a1b20] rounded-lg p-0.5 border border-white/5">
              <button
                onClick={() => setLanguage('fa')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                  language === 'fa'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                فا
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
