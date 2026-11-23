import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, X } from 'lucide-react';
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
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { QuickDictationSettings } from './types/asr';

const MainApp: React.FC = () => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    modelInfo,
    settings,
    activeLanguage,
    audioLevel,
    recordingDuration,
    allCurrentWords,
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
  }, []);

  const handleSaveToHistory = async (title: string, text: string, srt: string) => {
    const locale = language === 'fa' ? 'fa-IR' : 'en-US';
    const record = {
      id: crypto.randomUUID(),
      title,
      text,
      srtContent: srt,
      language: activeLanguage,
      durationSecs: recordingDuration || 1.0,
      wordCount: allCurrentWords.length,
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
      className="flex h-screen bg-[#111215] text-slate-100 overflow-hidden font-sans select-none"
      dir={language === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* Murmure-style Sidebar matching Image 2 */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Workspace Body */}
      <main className="flex-1 flex flex-col h-full bg-[#111215] overflow-hidden relative">
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

        {/* Tab 1: Accueil / Home (Murmure Dashboard matching Image 2) */}
        {activeTab === 'home' && (
          <MurmureHome
            audioLevel={audioLevel}
            quickDictationSettings={qdSettings}
            onOpenHistoryTab={() => setActiveTab('full_history')}
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
          <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
            <FileTranscription
              onSaveToHistory={handleSaveToHistory}
              isModelLoaded={!!modelInfo?.isLoaded}
            />
          </div>
        )}

        {/* Tab 10: Full History */}
        {activeTab === 'full_history' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
            <HistoryView />
          </div>
        )}

        {/* Tab 11: À propos (About) */}
        {activeTab === 'about' && <AboutView />}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  const isOverlay = window.location.search.includes('window=quick-dictation');

  return (
    <LanguageProvider>
      {isOverlay ? <QuickDictationOverlay /> : <MainApp />}
    </LanguageProvider>
  );
};
