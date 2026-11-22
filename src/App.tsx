import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Mic, Square, X, AlertCircle } from 'lucide-react';
import { useAsr } from './hooks/useAsr';
import { Header } from './components/Header';
import { AudioVisualizer } from './components/AudioVisualizer';
import { TranscriptView } from './components/TranscriptView';
import { ModelManager } from './components/ModelManager';
import { FileTranscription } from './components/FileTranscription';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { PerformancePanel } from './components/PerformancePanel';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'studio' | 'file' | 'history' | 'models' | 'settings'>('studio');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    modelInfo,
    settings,
    status,
    activeLanguage,
    eouProb,
    audioLevel,
    committedWords,
    openWords,
    tailWords,
    allCurrentWords,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
    loadModels,
    unloadModels,
    refreshModelStatus,
    updateSettings,
  } = useAsr();

  const isRecording = status === 'recording';
  const isProcessing = status === 'processing';

  const handleToggleRecord = async () => {
    setErrorMessage(null);
    if (isRecording) {
      try {
        await stopRecording();
      } catch (err: any) {
        setErrorMessage(String(err));
      }
    } else {
      if (!modelInfo?.isInstalled) {
        setErrorMessage('ابتدا باید مدل‌های بازشناسی در تب «مدیریت مدل‌ها» نصب شوند.');
        setActiveTab('models');
        return;
      }
      try {
        await startRecording();
      } catch (err: any) {
        setErrorMessage(String(err));
      }
    }
  };

  const handleLanguageChange = async (lang: 'fa' | 'en' | 'fa,en') => {
    try {
      await updateSettings({ ...settings, languageMode: lang });
    } catch (err) {
      console.error('Failed to change language:', err);
    }
  };

  const handleSaveToHistory = async (title: string, text: string, srt: string) => {
    const record = {
      id: crypto.randomUUID(),
      title,
      text,
      srtContent: srt,
      language: activeLanguage,
      durationSecs: recordingDuration || 1.0,
      wordCount: allCurrentWords.length,
      createdAt: new Date().toLocaleDateString('fa-IR', {
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
    <div className="flex flex-col h-screen bg-navy-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        modelInfo={modelInfo}
        settings={settings}
        onLanguageChange={handleLanguageChange}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 overflow-y-auto">
        {errorMessage && (
          <div className="mb-4 max-w-4xl mx-auto p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
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

        {/* Tab 1: Live Studio */}
        {activeTab === 'studio' && (
          <div className="h-full flex flex-col space-y-4 max-w-6xl mx-auto">
            {/* Top Control Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-navy-900/60 border border-slate-800/80 p-4 rounded-2xl backdrop-blur-md">
              {/* Record Action Button & Status */}
              <div className="flex items-center space-x-4 space-x-reverse">
                <button
                  onClick={handleToggleRecord}
                  disabled={isProcessing}
                  className={`relative flex items-center space-x-2.5 space-x-reverse px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 ${
                    isRecording
                      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30'
                      : 'bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40'
                  }`}
                >
                  {isRecording && (
                    <span className="absolute -inset-1 rounded-2xl bg-rose-500/30 animate-ping pointer-events-none" />
                  )}
                  {isRecording ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      <span>توقف ضبط</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>شروع ضبط صدا</span>
                    </>
                  )}
                </button>

                {isRecording && (
                  <button
                    onClick={cancelRecording}
                    className="flex items-center space-x-1.5 space-x-reverse px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs text-slate-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>لغو جلسه</span>
                  </button>
                )}

                {/* Status text */}
                <div className="text-xs text-slate-400 mr-2">
                  {isRecording ? (
                    <span className="flex items-center space-x-1.5 space-x-reverse text-cyan-300">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                      <span>در حال شنیدن و بازشناسی زنده...</span>
                    </span>
                  ) : isProcessing ? (
                    <span className="text-amber-300">در حال نهایی‌سازی متن...</span>
                  ) : (
                    <span>آماده برای ضبط</span>
                  )}
                </div>
              </div>

              {/* Real-time Audio Visualizer Meter */}
              <AudioVisualizer level={audioLevel} isRecording={isRecording} />
            </div>

            {/* Real-time Transcript Editor View */}
            <div className="flex-1 min-h-[420px]">
              <TranscriptView
                committedWords={committedWords}
                openWords={openWords}
                tailWords={tailWords}
                allWords={allCurrentWords}
                status={status}
                activeLanguage={activeLanguage}
                recordingDuration={recordingDuration}
                onClear={clearTranscript}
                onSaveToHistory={handleSaveToHistory}
              />
            </div>

            {/* Bottom Performance Info */}
            <PerformancePanel settings={settings} status={status} eouProb={eouProb} />
          </div>
        )}

        {/* Tab 2: File Transcription */}
        {activeTab === 'file' && (
          <FileTranscription
            onSaveToHistory={handleSaveToHistory}
            isModelLoaded={!!modelInfo?.isLoaded}
          />
        )}

        {/* Tab 3: History */}
        {activeTab === 'history' && <HistoryView />}

        {/* Tab 4: Models */}
        {activeTab === 'models' && (
          <ModelManager
            modelInfo={modelInfo}
            onRefresh={refreshModelStatus}
            onLoad={loadModels}
            onUnload={unloadModels}
          />
        )}

        {/* Tab 5: Settings */}
        {activeTab === 'settings' && (
          <SettingsModal
            settings={settings}
            onUpdateSettings={updateSettings}
          />
        )}
      </main>
    </div>
  );
};
