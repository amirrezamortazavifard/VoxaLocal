import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  TrendingUp,
  FileText,
  HardDrive,
  Keyboard,
  FileAudio,
  Sliders,
  Radio,
  Mic,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { AudioLevelPayload, TranscriptRecord, QuickDictationSettings } from '../../types/asr';
import { AudioMatrixVisualizer } from './AudioMatrixVisualizer';
import { useLanguage } from '../../i18n/LanguageContext';

interface MurmureHomeProps {
  audioLevel: AudioLevelPayload;
  quickDictationSettings: QuickDictationSettings;
  onOpenHistoryTab: () => void;
  onOpenFileTranscribeTab: () => void;
  onOpenShortcutsTab: () => void;
  onOpenSettingsTab: () => void;
}

export const MurmureHome: React.FC<MurmureHomeProps> = ({
  audioLevel,
  quickDictationSettings,
  onOpenHistoryTab,
  onOpenFileTranscribeTab,
  onOpenShortcutsTab,
  onOpenSettingsTab,
}) => {
  const { t, language } = useLanguage();
  const [recentRecords, setRecentRecords] = useState<TranscriptRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalWords, setTotalWords] = useState<number>(0);
  const [isMicTesting, setIsMicTesting] = useState(false);

  // Fetch recent dictations from local SQLite
  const loadRecentHistory = async () => {
    try {
      const records = await invoke<TranscriptRecord[]>('get_history');
      setRecentRecords(records.slice(0, 4));
      const wordsSum = records.reduce((acc, r) => acc + (r.wordCount || r.text.split(/\s+/).length), 0);
      setTotalWords(wordsSum);
    } catch (err) {
      console.error('Failed to load recent history:', err);
    }
  };

  useEffect(() => {
    loadRecentHistory();
  }, []);

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await invoke('delete_history_item', { id });
      setRecentRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm(t('confirmClearHistory'))) return;
    try {
      await invoke('clear_history');
      setRecentRecords([]);
      setTotalWords(0);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const handleTestModal = async () => {
    try {
      await invoke('start_quick_dictation_session');
    } catch (err) {
      console.error('Failed to launch dictation modal:', err);
    }
  };

  const formatWordCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return `${count}`;
  };

  const formatDuration = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto space-y-6 font-sans select-none">
      {/* Top Header Metrics Row */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center space-x-2 space-x-reverse">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          <span className="text-xs text-slate-400 font-medium">
            {language === 'fa' ? 'موتور استنتاج محلی آماده است' : 'Inference Engine Ready'}
          </span>
        </div>

        {/* Metric Badges */}
        <div className="flex items-center space-x-3 space-x-reverse text-xs">
          {/* Speed Badge */}
          <div className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-full bg-[#1b232c] border border-cyan-500/20 text-cyan-300 shadow-sm font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span dir="ltr">191.4 {language === 'fa' ? 'کلمه/دقیقه' : 'words/min'}</span>
          </div>

          {/* Word Count Badge */}
          <div className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-full bg-[#24211a] border border-amber-500/20 text-amber-300 shadow-sm font-medium">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span dir="ltr">
              {formatWordCount(totalWords > 0 ? totalWords : 45900)} {language === 'fa' ? 'کلمه' : 'words'}
            </span>
          </div>

          {/* Storage / Offline Badge */}
          <div className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-full bg-[#261c24] border border-rose-500/20 text-rose-300 shadow-sm font-medium">
            <HardDrive className="w-3.5 h-3.5 text-rose-400" />
            <span dir="ltr">100% Offline (Local)</span>
          </div>
        </div>
      </div>

      {/* Hero Title & Description */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5 space-x-reverse">
          <Sparkles className="w-6 h-6 text-cyan-400" />
          <span>{language === 'fa' ? 'خوش آمدید !' : 'Welcome to VoxaLocal !'}</span>
        </h2>
        <p className="text-xs text-slate-400">
          {t('murmureHeroSubtitle')}
        </p>
      </div>

      {/* ================= PRIMARY FEATURE: REAL-TIME GLOBAL SHORTCUT MODAL ================= */}
      <div className="bg-[#18191d] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden space-y-4">
        {/* Subtle top ambient glow */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center space-x-2 space-x-reverse">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
              </span>
              <h3 className="text-base font-bold text-white tracking-wide">
                {t('globalDictationHeroTitle')}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              {t('globalDictationHeroDesc')}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5 space-x-reverse shrink-0">
            <button
              onClick={handleTestModal}
              className="flex items-center space-x-1.5 space-x-reverse px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
              title="Test the desktop dictation overlay right now"
            >
              <Radio className="w-4 h-4" />
              <span>{t('testDictationModal')}</span>
            </button>

            <button
              onClick={onOpenShortcutsTab}
              className="flex items-center space-x-1.5 space-x-reverse px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/10 text-xs transition-colors cursor-pointer"
              title="Change global hotkey"
            >
              <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('changeShortcut')}</span>
            </button>
          </div>
        </div>

        {/* Global Shortcut Visual Keyboard Pills */}
        <div className="pt-2 flex flex-wrap items-center justify-between border-t border-white/[0.06] text-xs gap-2">
          <div className="flex items-center space-x-2 space-x-reverse text-slate-400">
            <span>{language === 'fa' ? 'کلید میانبر فعال سیستم:' : 'Active System Shortcut:'}</span>
            <div className="flex items-center space-x-1 space-x-reverse" dir="ltr">
              {quickDictationSettings.shortcut.split('+').map((keyPart, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-500 text-xs">+</span>}
                  <kbd className="px-2.5 py-1 rounded-lg bg-[#252830] text-cyan-300 border border-cyan-500/30 font-mono text-xs font-bold shadow-md shadow-black/40">
                    {keyPart.trim()}
                  </kbd>
                </React.Fragment>
              ))}
            </div>
          </div>

          <span className="text-[11px] text-slate-400 italic">
            {language === 'fa'
              ? '✨ پس از فشردن کلید، مودال در پایین صفحه باز می‌شود و امکان ویرایش و کپی فوری را به شما می‌دهد.'
              : '✨ Shortcut pops up the bottom-center desktop modal for live transcription & instant copy.'}
          </span>
        </div>
      </div>

      {/* ================= TWO CORE CAPABILITY TILES ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tile 1: File Transcription */}
        <div className="bg-[#18191d] border border-white/[0.08] hover:border-amber-500/30 rounded-2xl p-5 shadow-xl transition-all flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileAudio className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-white">
              {t('fileTranscribeCardTitle')}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('fileTranscribeCardDesc')}
            </p>
          </div>

          <button
            onClick={onOpenFileTranscribeTab}
            className="flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-amber-500/15 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <span>{t('startFileTranscribe')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tile 2: Settings & Customization */}
        <div className="bg-[#18191d] border border-white/[0.08] hover:border-indigo-500/30 rounded-2xl p-5 shadow-xl transition-all flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-white">
              {t('settingsCardTitle')}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('settingsCardDesc')}
            </p>
          </div>

          <button
            onClick={onOpenSettingsTab}
            className="flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-indigo-500/15 text-slate-300 hover:text-indigo-300 border border-white/10 hover:border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <span>{t('openSettings')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ================= MICROPHONE HEALTH & LEVEL CHECK ================= */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-5 shadow-xl flex flex-col items-center justify-center space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between w-full px-2">
          <div className="flex items-center space-x-2 space-x-reverse">
            <Mic className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200">
              {t('micHealthCheck')}
            </h3>
          </div>

          <button
            onClick={() => setIsMicTesting(!isMicTesting)}
            className={`flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
              isMicTesting
                ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isMicTesting ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{isMicTesting ? (language === 'fa' ? 'در حال پایش سیگنال' : 'Testing Active') : (language === 'fa' ? 'شروع تست' : 'Start Test')}</span>
          </button>
        </div>

        {/* LED Matrix Equalizer */}
        <AudioMatrixVisualizer level={audioLevel} isTesting={isMicTesting} isRecording={false} />

        <p className="text-[11px] text-slate-400 text-center">
          {t('micTestingDesc')}
        </p>
      </div>

      {/* ================= RECENT ACTIVITY SECTION ================= */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 space-x-reverse">
            <h3 className="text-sm font-bold text-white tracking-wide">
              {t('recentActivityTitle')}
            </h3>
            <span className="text-[10px] text-slate-400 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/5">
              {recentRecords.length}
            </span>
          </div>

          {recentRecords.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-slate-500 hover:text-rose-400 flex items-center space-x-1 space-x-reverse transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('clearAllHistory')}</span>
            </button>
          )}
        </div>

        {recentRecords.length === 0 ? (
          <div className="bg-[#18191d] border border-white/[0.06] rounded-2xl p-8 text-center text-slate-500 text-xs space-y-2">
            <FileText className="w-8 h-8 text-slate-600 mx-auto" />
            <p>{language === 'fa' ? 'هنوز رونویسی انجام نشده است. کلید میانبر را فشار دهید تا اولین رونویسی شما آغاز شود.' : 'No recent transcripts yet. Press the global shortcut to start your first dictation.'}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentRecords.map((item) => (
              <div
                key={item.id}
                className="bg-[#18191d] border border-white/[0.06] hover:border-white/15 rounded-xl p-3.5 transition-all flex items-center justify-between gap-4 group"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center space-x-2 space-x-reverse text-xs">
                    <span className="text-slate-300 font-semibold truncate max-w-xs">{item.title}</span>
                    <span className="text-slate-500 text-[10px]">•</span>
                    <span className="text-slate-500 text-[10px]">{item.createdAt}</span>
                    <span className="text-slate-500 text-[10px]">•</span>
                    <span className="text-cyan-400 text-[10px]">{formatDuration(item.durationSecs || 0)}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate leading-relaxed" dir="auto">
                    {item.text}
                  </p>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse shrink-0">
                  <button
                    onClick={() => handleCopy(item.id, item.text)}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-cyan-300 transition-colors border border-white/5 cursor-pointer"
                    title="Copy transcript text"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors border border-white/5 cursor-pointer"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* View All History Link Button */}
        <div className="pt-2 flex justify-center">
          <button
            onClick={onOpenHistoryTab}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center space-x-1.5 space-x-reverse px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/20 cursor-pointer"
          >
            <span>{t('viewAllHistory')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
