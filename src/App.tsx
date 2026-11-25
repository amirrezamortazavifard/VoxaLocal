import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, Download, X } from 'lucide-react';
import { useAsr } from './hooks/useAsr';
import { Sidebar, DashboardTab } from './components/dashboard/Sidebar';
import { MurmureHome } from './components/dashboard/MurmureHome';
import { CustomDictionaryView } from './components/customization/CustomDictionaryView';
import { FormattingRulesView } from './components/customization/FormattingRulesView';
import { LlmConnectionView } from './components/customization/LlmConnectionView';
import { VocalModeView } from './components/customization/VocalModeView';
import { ShortcutsView } from './components/customization/ShortcutsView';
import { SystemView } from './components/dashboard/SystemView';
import { ImportExportView } from './components/dashboard/ImportExportView';
import { FileTranscription } from './components/FileTranscription';
import { HistoryView } from './components/HistoryView';
import { AboutView } from './components/about/AboutView';
import { QuickDictationOverlay } from './components/quick-dictation/QuickDictationOverlay';
import { TitleBar } from './components/TitleBar';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { QuickDictationSettings, UpdateInfo } from './types/asr';

const MainApp: React.FC = () => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  const {
    modelInfo,
    settings,
    audioLevel,
    loadModels,
    unloadModels,
    refreshModelStatus,
    updateSettings,
  } = useAsr();

  const [qdSettings, setQdSettings] = useState<QuickDictationSettings>({
    enabled: true,
    shortcut: 'Ctrl+Shift+Space',
    mode: 'pushToTalk',
    autoPaste: true,
    timeoutSeconds: 15,
    showWaveform: true,
  });

  useEffect(() => {
    invoke<QuickDictationSettings>('get_quick_dictation_settings')
      .then((s) => setQdSettings(s))
      .catch(console.error);

    invoke<UpdateInfo | null>('get_pending_update')
      .then((u) => {
        if (u) setPendingUpdate(u);
      })
      .catch(console.error);

    const unlistenPromise = listen<UpdateInfo>('app://update-ready', (event) => {
      setPendingUpdate(event.payload);
      setUpdateBannerDismissed(false);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleInstallAndRestart = async () => {
    try {
      await invoke('install_and_restart_update');
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  const handleSaveToHistory = async (title: string, text: string, srt: string) => {
    const locale = language === 'fa' ? 'fa-IR' : 'en-US';
    const wordsCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const record = {
      id: crypto.randomUUID(),
      title,
      text,
      srtContent: srt,
      language: language === 'fa' ? 'fa' : 'en',
      durationSecs: 1.0,
      wordCount: wordsCount,
      createdAt: new Date().toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    await invoke('save_transcript', { record });
  };

  return (
    <div
      className="flex flex-col h-screen bg-[#111215] text-slate-100 overflow-hidden font-sans select-none border border-white/[0.08]"
      dir={language === 'fa' ? 'rtl' : 'ltr'}
    >
      <TitleBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Murmure-style Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Workspace Body */}
        <main className="flex-1 flex flex-col h-full bg-[#111215] overflow-hidden relative min-w-0">
        {pendingUpdate && !updateBannerDismissed && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-lg shrink-0">
            <div className="flex items-center space-x-2 space-x-reverse min-w-0">
              <Download className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {language === 'fa'
                  ? `نسخه جدید v${pendingUpdate.version} دانلود شد و آماده نصب است. مایل به نصب و راه‌اندازی مجدد هستید؟`
                  : `VoxaLocal v${pendingUpdate.version} has been downloaded silently. Install and restart now?`}
              </span>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse shrink-0">
              <button
                onClick={handleInstallAndRestart}
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer"
              >
                {language === 'fa' ? 'نصب و ریستارت' : 'Install & Restart'}
              </button>
              <button
                onClick={() => setUpdateBannerDismissed(true)}
                className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 text-[11px] transition-colors cursor-pointer"
              >
                {language === 'fa' ? 'بعداً' : 'Later'}
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="m-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-2 space-x-reverse">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab 1: Accueil / Home */}
        {activeTab === 'home' && (
          <MurmureHome
            audioLevel={audioLevel}
            quickDictationSettings={qdSettings}
            onOpenHistoryTab={() => setActiveTab('full_history')}
            onOpenFileTranscribeTab={() => setActiveTab('file_transcribe')}
            onOpenShortcutsTab={() => setActiveTab('shortcuts')}
            onOpenSettingsTab={() => setActiveTab('system')}
          />
        )}

        {/* Tab 2: Dictionnaire (Custom Dictionary) */}
        {activeTab === 'dictionary' && <CustomDictionaryView />}

        {/* Tab 3: Règles de formatage (Formatting Rules) */}
        {activeTab === 'rules' && <FormattingRulesView />}

        {/* Tab 4: Connexion LLM (Local LLM Integration) */}
        {activeTab === 'llm' && <LlmConnectionView />}

        {/* Tab 5: Mode Vocal (Voice Mode) */}
        {activeTab === 'voice_mode' && <VocalModeView />}

        {/* Tab 6: Raccourcis (Shortcuts) */}
        {activeTab === 'shortcuts' && <ShortcutsView />}

        {/* Tab 7: Système (System & Model Manager) */}
        {activeTab === 'system' && (
          <SystemView
            modelInfo={modelInfo}
            settings={settings}
            onRefreshModels={refreshModelStatus}
            onLoadModels={loadModels}
            onUnloadModels={unloadModels}
            onUpdateSettings={updateSettings}
          />
        )}

        {/* Tab 8: Import / Export */}
        {activeTab === 'import_export' && <ImportExportView />}

        {/* Tab 9: File Transcription */}
        {activeTab === 'file_transcribe' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 w-full min-w-0">
            <FileTranscription
              onSaveToHistory={handleSaveToHistory}
              isModelLoaded={!!modelInfo?.isLoaded}
            />
          </div>
        )}

        {/* Tab 10: Full History */}
        {activeTab === 'full_history' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 w-full min-w-0">
            <HistoryView />
          </div>
        )}

        {/* Tab 11: À propos (About) */}
        {activeTab === 'about' && <AboutView />}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const isOverlay = window.location.search.includes('window=quick-dictation');

  useEffect(() => {
    if (isOverlay) {
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    }
  }, [isOverlay]);

  return (
    <LanguageProvider>
      {isOverlay ? <QuickDictationOverlay /> : <MainApp />}
    </LanguageProvider>
  );
};
