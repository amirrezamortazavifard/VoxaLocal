import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  TrendingUp,
  FileText,
  HardDrive,
  Info,
  Trash2,
  Copy,
  Check,
  Mic,
} from 'lucide-react';
import { AudioLevelPayload, TranscriptRecord, QuickDictationSettings } from '../../types/asr';
import { AudioMatrixVisualizer } from './AudioMatrixVisualizer';
import { useLanguage } from '../../i18n/LanguageContext';

interface MurmureHomeProps {
  audioLevel: AudioLevelPayload;
  quickDictationSettings: QuickDictationSettings;
  onOpenHistoryTab: () => void;
}

export const MurmureHome: React.FC<MurmureHomeProps> = ({
  audioLevel,
  quickDictationSettings,
  onOpenHistoryTab,
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

  const handleTriggerQuickDictation = async () => {
    try {
      await invoke('start_quick_dictation_session');
    } catch (err) {
      console.error('Failed to trigger quick dictation:', err);
    }
  };

  // Format words count e.g. 45.9K mots
  const formatWordCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return `${count}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto space-y-6 font-sans select-none">
      {/* Top Header Metrics Row matching Image 2 */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex-1" />

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

      {/* Hero Title & Description matching Image 2 */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {language === 'fa' ? 'خوش آمدید !' : 'Bienvenue !'}
        </h2>
        <p className="text-xs text-slate-400">
          {t('murmureHeroSubtitle')}
        </p>
      </div>

      {/* Central Card: Entrée audio with LED Matrix Visualizer matching Image 2 */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center space-y-4 relative overflow-hidden">
        {/* Subtle top edge glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent pointer-events-none" />

        <div className="flex items-center justify-between w-full px-2">
          <div className="w-6" />
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide">
            {t('audioInputTitle')}
          </h3>
          <button
            onClick={() => setIsMicTesting(!isMicTesting)}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              isMicTesting
                ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Mic Equalizer Test"
          >
            <Mic className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* LED Matrix Equalizer */}
        <AudioMatrixVisualizer level={audioLevel} isTesting={isMicTesting} />

        {/* Interactive Shortcut Prompt Pill matching Image 2 */}
        <div
          onClick={handleTriggerQuickDictation}
          className="group flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all cursor-pointer shadow-sm"
          title="Click to trigger Quick Dictation overlay"
        >
          <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
            {language === 'fa' ? 'برای شروع / توقف ضبط کلید میانبر' : 'Appuyer sur'}
          </span>

          <div className="flex items-center space-x-1 space-x-reverse" dir="ltr">
            {quickDictationSettings.shortcut.split('+').map((keyPart, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-500 text-xs">+</span>}
                <span className="px-2 py-0.5 rounded-md bg-[#252830] text-slate-200 border border-white/10 font-mono text-[11px] font-semibold shadow-inner">
                  {keyPart.trim()}
                </span>
              </React.Fragment>
            ))}
          </div>

          <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
            {language === 'fa' ? 'را فشار دهید' : "pour démarrer/arrêter l'enregistrement"}
          </span>
        </div>
      </div>

      {/* Recent Activity Card matching Image 2 */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 space-x-reverse text-slate-200 text-sm font-semibold">
            <span>{t('recentActivityTitle')}</span>
            <Info className="w-3.5 h-3.5 text-slate-500" />
          </div>

          {recentRecords.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-colors cursor-pointer"
              title={t('clearAllHistory')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Activity Items List */}
        <div className="space-y-2">
          {recentRecords.length > 0 ? (
            recentRecords.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] transition-all"
              >
                {/* Text Preview */}
                <div className="flex-1 truncate pe-4 text-xs text-slate-300 font-normal" dir="auto">
                  {item.text}
                </div>

                {/* Right metadata & actions */}
                <div className="flex items-center space-x-3 space-x-reverse shrink-0">
                  <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                    {item.createdAt || 'Just now'}
                  </span>

                  {/* Copy Button */}
                  <button
                    onClick={() => handleCopy(item.id, item.text)}
                    className="p-1 rounded-md text-slate-500 hover:text-cyan-300 transition-colors cursor-pointer"
                    title={t('copyText')}
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Delete Item */}
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    title={t('deleteItem')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            /* Sample default cards matching the exact text in Image 2! */
            <>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-xs text-slate-300">
                  The software is free, open source, and auditable.
                </span>
                <span className="text-[11px] text-slate-500 font-mono" dir="ltr">Just now</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-xs text-slate-300">
                  We do not track anything, no telemetry, no network calls.
                </span>
                <span className="text-[11px] text-slate-500 font-mono" dir="ltr">Just now</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-xs text-slate-300">
                  We protect your data and only store the absolute minimum.
                </span>
                <span className="text-[11px] text-slate-500 font-mono" dir="ltr">Just now</span>
              </div>
            </>
          )}
        </div>

        {/* View all in history link */}
        <div className="pt-2 text-center">
          <button
            onClick={onOpenHistoryTab}
            className="text-[11px] text-cyan-400/80 hover:text-cyan-300 transition-colors font-medium cursor-pointer"
          >
            {t('viewAllHistory')} →
          </button>
        </div>
      </div>
    </div>
  );
};
