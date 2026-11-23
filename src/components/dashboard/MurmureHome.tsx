import React, { useState, useEffect, useRef } from 'react';
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
  Square,
  Radio,
  Volume2,
} from 'lucide-react';
import { AudioLevelPayload, TranscriptRecord, QuickDictationSettings, WordItem } from '../../types/asr';
import { AudioMatrixVisualizer } from './AudioMatrixVisualizer';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatPersianTranscript } from '../../utils/persianTypography';

interface MurmureHomeProps {
  audioLevel: AudioLevelPayload;
  quickDictationSettings: QuickDictationSettings;
  onOpenHistoryTab: () => void;
  status?: string;
  recordingDuration?: number;
  committedWords?: WordItem[];
  openWords?: WordItem[];
  tailWords?: WordItem[];
  allCurrentWords?: WordItem[];
  startRecording?: () => Promise<string>;
  stopRecording?: () => Promise<void>;
  clearTranscript?: () => void;
  activeLanguage?: string;
  onSaveToHistory?: (title: string, text: string, srt: string) => Promise<void>;
}

export const MurmureHome: React.FC<MurmureHomeProps> = ({
  audioLevel,
  quickDictationSettings,
  onOpenHistoryTab,
  status = 'idle',
  recordingDuration = 0,
  committedWords = [],
  openWords = [],
  tailWords = [],
  allCurrentWords = [],
  startRecording,
  stopRecording,
  clearTranscript,
  activeLanguage = 'fa',
  onSaveToHistory,
}) => {
  const { t, language } = useLanguage();
  const [recentRecords, setRecentRecords] = useState<TranscriptRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalWords, setTotalWords] = useState<number>(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll transcript container to bottom as words stream in
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [committedWords, openWords, tailWords]);

  // Window shortcut listener for Ctrl+Shift+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
        e.preventDefault();
        handleToggleRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  const handleToggleRecording = async () => {
    try {
      if (status === 'recording') {
        if (stopRecording) {
          await stopRecording();
        } else {
          await invoke('stop_recording');
        }

        // Save session to history if words were recognized
        const words = allCurrentWords.length > 0 ? allCurrentWords : [...committedWords, ...openWords, ...tailWords];
        if (words.length > 0) {
          const raw = wordsToPlainString(words);
          const formatted = formatPersianTranscript(raw);
          const locale = language === 'fa' ? 'fa-IR' : 'en-US';
          const title = `Studio Recording - ${new Date().toLocaleTimeString(locale)}`;
          if (onSaveToHistory) {
            await onSaveToHistory(title, formatted, '');
          } else {
            await invoke('save_transcript', {
              record: {
                id: crypto.randomUUID(),
                title,
                text: formatted,
                srtContent: null,
                language: activeLanguage,
                durationSecs: recordingDuration || 1.0,
                wordCount: words.length,
                createdAt: new Date().toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            });
          }
          await loadRecentHistory();
        }
      } else {
        if (clearTranscript) clearTranscript();
        if (startRecording) {
          await startRecording();
        } else {
          await invoke('start_recording', { clientSessionId: crypto.randomUUID() });
        }
      }
    } catch (err) {
      console.error('Failed to toggle recording:', err);
    }
  };

  const handleCopyTranscript = async () => {
    const words = allCurrentWords.length > 0 ? allCurrentWords : [...committedWords, ...openWords, ...tailWords];
    if (words.length === 0) return;
    const raw = wordsToPlainString(words);
    const formatted = formatPersianTranscript(raw);
    await navigator.clipboard.writeText(formatted);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleClearTranscript = () => {
    if (clearTranscript) {
      clearTranscript();
    }
  };

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

  const formatWordCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return `${count}`;
  };

  const formatDuration = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const hasWords = committedWords.length > 0 || openWords.length > 0 || tailWords.length > 0;
  const sessionWordCount = committedWords.length + openWords.length + tailWords.length;

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
        <AudioMatrixVisualizer level={audioLevel} isTesting={isMicTesting} isRecording={status === 'recording'} />

        {/* Interactive Shortcut Prompt Pill matching Image 2 */}
        <div
          onClick={handleToggleRecording}
          className={`group flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl border transition-all cursor-pointer shadow-sm ${
            status === 'recording'
              ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/40 text-rose-300'
              : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-400'
          }`}
          title="Click to start/stop recording"
        >
          {status === 'recording' ? (
            <div className="flex items-center space-x-2 space-x-reverse text-xs font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>{language === 'fa' ? 'در حال ضبط و بازشناسی زنده... (کلیک برای توقف)' : 'Recording live... (Click to stop)'}</span>
            </div>
          ) : (
            <>
              <span className="text-xs group-hover:text-slate-200 transition-colors">
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

              <span className="text-xs group-hover:text-slate-200 transition-colors">
                {language === 'fa' ? 'را فشار دهید' : "pour démarrer/arrêter l'enregistrement"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* LIVE REAL-TIME TRANSCRIPTION CARD (Directly above Recent Activities) */}
      <div className="bg-[#18191d] border border-cyan-500/20 rounded-2xl p-6 shadow-2xl space-y-4 relative overflow-hidden transition-all">
        {/* Top ambient highlight */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

        {/* Card Header & Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="flex items-center space-x-2 space-x-reverse text-slate-100 text-sm font-semibold">
              <Radio className={`w-4 h-4 ${status === 'recording' ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
              <span>{language === 'fa' ? 'رونوشت زنده و بی‌درنگ گفتار' : 'Live Speech-to-Text Stream'}</span>
            </div>

            {/* Status indicator pill */}
            {status === 'recording' ? (
              <span className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <span>{formatDuration(recordingDuration)}</span>
              </span>
            ) : status === 'processing' ? (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-medium">
                {language === 'fa' ? 'در حال تکمیل...' : 'Processing...'}
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>TinyASR Offline</span>
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 space-x-reverse">
            {/* Record / Stop Button */}
            <button
              onClick={handleToggleRecording}
              className={`flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
                status === 'recording'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
              }`}
              title={status === 'recording' ? 'Stop recording' : 'Start recording'}
            >
              {status === 'recording' ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>{language === 'fa' ? 'توقف و ذخیره' : 'Stop & Save'}</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>{language === 'fa' ? 'شروع ضبط زنده' : 'Start Recording'}</span>
                </>
              )}
            </button>

            {/* Copy Button */}
            {hasWords && (
              <button
                onClick={handleCopyTranscript}
                className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer border border-white/10"
                title="Copy live transcript"
              >
                {copiedTranscript ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Clear Button */}
            {hasWords && status !== 'recording' && (
              <button
                onClick={handleClearTranscript}
                className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer border border-white/10"
                title="Clear transcript"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Real-time Streaming Transcript Output Box (Identical to tinyasr-main) */}
        <div
          ref={transcriptScrollRef}
          className="min-h-[140px] max-h-[250px] overflow-y-auto p-4 rounded-xl bg-[#111215]/90 border border-white/[0.08] text-sm leading-relaxed select-text font-sans tracking-wide transition-all shadow-inner"
          dir="auto"
        >
          {!hasWords ? (
            <div className="h-full flex flex-col items-center justify-center py-8 text-center text-slate-500 text-xs space-y-2 select-none">
              <Volume2 className="w-6 h-6 text-slate-600" />
              <span>
                {language === 'fa'
                  ? 'رونوشت کلمات شما بی‌درنگ و کلمه به کلمه اینجا ظاهر می‌شوند. برای شروع دکمه ضبط را بزنید یا صحبت کنید...'
                  : 'Spoken words appear here in real-time, word-by-word. Press record or speak to begin...'}
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              {/* 1. Committed finalized words (Frozen) */}
              {committedWords.map((word, idx) => (
                <span
                  key={`commit-${idx}-${word.start}`}
                  className="text-slate-100 font-normal transition-colors"
                >
                  {idx > 0 && !word.join ? ' ' : ''}
                  {word.text}
                </span>
              ))}

              {/* 2. Open words from sentence re-decoding */}
              {openWords.map((word, idx) => (
                <span
                  key={`open-${idx}-${word.start}`}
                  className="text-slate-200 font-normal transition-colors"
                >
                  {(committedWords.length > 0 || idx > 0) && !word.join ? ' ' : ''}
                  {word.text}
                </span>
              ))}

              {/* 3. Tail words from live streaming transducer (Instantaneous word typing) */}
              {tailWords.map((word, idx) => (
                <span
                  key={`tail-${idx}-${word.start}`}
                  className="text-cyan-400 font-semibold drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] transition-all"
                >
                  {(committedWords.length > 0 || openWords.length > 0 || idx > 0) && !word.join ? ' ' : ''}
                  {word.text}
                </span>
              ))}

              {/* Blinking Typing Cursor */}
              {status === 'recording' && (
                <span className="inline-block w-1.5 h-4.5 bg-cyan-400 rounded-full animate-cursor-blink self-center ms-1 shadow-[0_0_8px_#22d3ee]" />
              )}
            </div>
          )}
        </div>

        {/* Live Transcript Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/[0.04]">
          <div className="flex items-center space-x-2 space-x-reverse font-mono text-[11px]">
            <span>
              {sessionWordCount} {language === 'fa' ? 'کلمه شناسایی‌شده' : 'words recognized'}
            </span>
          </div>

          <div className="text-[11px] text-cyan-400/80 font-mono" dir="ltr">
            TinyASR Greedy (1-Beam Low-Latency)
          </div>
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

function wordsToPlainString(words: WordItem[]): string {
  let result = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i > 0 && !w.join) {
      result += ' ';
    }
    result += w.text;
  }
  return result;
}
