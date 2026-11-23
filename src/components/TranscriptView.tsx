import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Trash2,
  Download,
  Save,
  Check,
  Clock,
  Sparkles,
  Radio,
  Edit3,
  ArrowDown,
  RotateCcw,
} from 'lucide-react';
import { TrackedWordItem, WordItem } from '../types/asr';
import { formatPersianTranscript } from '../utils/persianTypography';
import {
  exportAsFile,
  exportWordsAsJson,
  generateSrtFromWords,
  wordsToPlainString,
} from '../utils/exportFormats';
import { useLanguage } from '../i18n/LanguageContext';

interface TranscriptViewProps {
  committedWords: WordItem[];
  trackedProvisionalWords: TrackedWordItem[];
  allWords: WordItem[];
  status: string;
  activeLanguage: string;
  recordingDuration: number;
  onClear: () => void;
  onSaveToHistory: (title: string, text: string, srt: string) => Promise<void>;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  committedWords,
  trackedProvisionalWords,
  allWords,
  status,
  activeLanguage,
  recordingDuration,
  onClear,
  onSaveToHistory,
}) => {
  const { t, language } = useLanguage();
  const [usePersianTypography, setUsePersianTypography] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable transcript mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedText, setEditedText] = useState<string | null>(null);

  // Auto-scroll control
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const rawAsrText = wordsToPlainString(allWords);
  const formattedRawText =
    usePersianTypography && (activeLanguage === 'fa' || language === 'fa')
      ? formatPersianTranscript(rawAsrText)
      : rawAsrText;

  // The text currently displayed / copied / exported
  const currentText = editedText !== null ? editedText : formattedRawText;
  const isModified = editedText !== null && editedText !== formattedRawText;

  const isRecording = status === 'recording';
  const hasUncommitted = trackedProvisionalWords.length > 0;
  const hasCorrectedWords = trackedProvisionalWords.some(
    (w) => w.visualState === 'provisional-corrected'
  );

  // Auto-scroll to bottom on new words unless user scrolled up
  useEffect(() => {
    if (!isUserScrolledUp && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [committedWords.length, trackedProvisionalWords.length, isUserScrolledUp]);

  // Handle scroll events to detect user manual scrolling
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 45;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setIsUserScrolledUp(false);
    }
  };

  const handleCopy = async () => {
    if (!currentText) return;
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!allWords.length || isSaving) return;
    setIsSaving(true);
    try {
      const dateStr = new Date().toLocaleTimeString(language === 'fa' ? 'fa-IR' : 'en-US');
      const title = `${t('appTitle')} - ${dateStr} (${allWords.length} ${t('wordCount')})${
        isModified ? ' [Edited]' : ''
      }`;
      const srt = generateSrtFromWords(allWords);
      await onSaveToHistory(title, currentText, srt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save to history:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportTxt = () => {
    if (!currentText) return;
    const filename = `VoxLocal_Transcript_${Date.now()}.txt`;
    exportAsFile(currentText, filename);
  };

  const handleExportSrt = () => {
    if (!allWords.length) return;
    const srt = generateSrtFromWords(allWords);
    const filename = `VoxLocal_Subtitles_${Date.now()}.srt`;
    exportAsFile(srt, filename);
  };

  const handleExportJson = () => {
    if (!allWords.length) return;
    const json = exportWordsAsJson(
      'VoxLocal Transcript',
      allWords,
      activeLanguage,
      recordingDuration
    );
    const filename = `VoxLocal_WordTimestamps_${Date.now()}.json`;
    exportAsFile(json, filename, 'application/json');
  };

  const handleResetEdit = () => {
    setEditedText(null);
    setIsEditMode(false);
  };

  return (
    <div className="relative flex flex-col h-full bg-navy-900/70 border border-slate-800/80 rounded-2xl backdrop-blur-md overflow-hidden shadow-2xl transition-all">
      {/* Sub-header Controls Bar */}
      <div className="px-5 py-3 border-b border-slate-800/80 bg-navy-950/70 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-3 space-x-reverse">
          {/* Recording Timer */}
          <div className="flex items-center space-x-1.5 space-x-reverse text-xs text-slate-300 font-mono bg-navy-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span dir="ltr">{formatDuration(recordingDuration)}</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Word Count */}
          <div className="text-xs text-slate-400">
            {t('wordCount')}:{' '}
            <span className="font-mono text-cyan-300 font-bold" dir="ltr">
              {allWords.length}
            </span>
          </div>

          {/* Re-decoding active badge */}
          {hasCorrectedWords && (
            <div className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[11px] border border-amber-500/30 animate-pulse shadow-sm shadow-amber-500/20">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{t('redecodingActive')}</span>
            </div>
          )}

          {isModified && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-800/60 text-cyan-300 font-mono">
              Edited
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 space-x-reverse">
          {/* Edit / View Toggle */}
          <button
            onClick={() => {
              if (!isEditMode && editedText === null) {
                setEditedText(formattedRawText);
              }
              setIsEditMode(!isEditMode);
            }}
            disabled={!allWords.length}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all flex items-center space-x-1 space-x-reverse disabled:opacity-40 ${
              isEditMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditMode ? t('viewMode') : t('editTranscript')}</span>
          </button>

          {isModified && (
            <button
              onClick={handleResetEdit}
              className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-rose-300 bg-navy-950 border border-slate-800 hover:border-rose-900/50 transition-colors"
              title={t('resetToOriginal')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Persian Typography Toggle */}
          <button
            onClick={() => setUsePersianTypography(!usePersianTypography)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              usePersianTypography
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-sm'
                : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="اصلاح نیم‌فاصله‌ها و کاراکترهای عربی به فارسی"
          >
            {t('smartZwnj')}
          </button>

          {/* Timestamps toggle */}
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              showTimestamps
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-sm'
                : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {t('timestamps')}
          </button>

          <span className="text-slate-700">|</span>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            disabled={!allWords.length}
            className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition-colors shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('copied') : t('copyText')}</span>
          </button>

          {/* Save to History */}
          <button
            onClick={handleSave}
            disabled={!allWords.length || isSaving}
            className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 disabled:opacity-40 transition-colors shadow-sm"
          >
            {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saved ? t('saved') : t('saveToHistory')}</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative group">
            <button
              disabled={!allWords.length}
              className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('export')}</span>
            </button>
            <div className="absolute left-0 mt-1 w-40 bg-navy-950 border border-slate-800 rounded-xl shadow-2xl py-1.5 hidden group-hover:block z-30">
              <button
                onClick={handleExportTxt}
                className="w-full text-right px-3.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
              >
                {t('exportTxt')}
              </button>
              <button
                onClick={handleExportSrt}
                className="w-full text-right px-3.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
              >
                {t('exportSrt')}
              </button>
              <button
                onClick={handleExportJson}
                className="w-full text-right px-3.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
              >
                {t('exportJson')}
              </button>
            </div>
          </div>

          {/* Clear Button */}
          <button
            onClick={() => {
              setEditedText(null);
              setIsEditMode(false);
              onClear();
            }}
            disabled={!allWords.length && !isRecording}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 transition-colors"
            title={t('clearText')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-6 overflow-y-auto leading-loose text-base font-sans select-text scroll-smooth space-y-5"
      >
        {allWords.length === 0 && !isRecording ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center text-slate-500 py-16">
            <div className="w-16 h-16 rounded-3xl bg-navy-950 border border-slate-800/90 flex items-center justify-center mb-4 shadow-xl">
              <Clock className="w-8 h-8 text-cyan-500/60" />
            </div>
            <p className="text-sm font-semibold text-slate-200 mb-1.5">{t('studioReadyTitle')}</p>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              {t('studioReadyDesc')}
            </p>
          </div>
        ) : isEditMode ? (
          /* Editable Transcript Textarea */
          <div className="h-full flex flex-col space-y-2">
            <textarea
              value={currentText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full flex-1 min-h-[320px] bg-navy-950/80 border border-slate-800 rounded-xl p-4 text-slate-100 text-lg leading-relaxed focus:outline-none focus:border-cyan-500/50 resize-none font-sans"
              dir={language === 'fa' || activeLanguage === 'fa' ? 'rtl' : 'ltr'}
              placeholder={t('editPlaceholder')}
            />
            <div className="text-xs text-slate-500 flex justify-between items-center">
              <span>{t('editHint')}</span>
              {isModified && (
                <button
                  onClick={handleResetEdit}
                  className="text-cyan-400 hover:underline"
                >
                  {t('resetToOriginal')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Visual distinction legend */}
            <div className="flex items-center space-x-4 space-x-reverse text-[11px] text-slate-400 pb-2 border-b border-slate-800/40">
              <span className="flex items-center space-x-1.5 space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-slate-100 shadow-sm shadow-slate-100/50"></span>
                <span>{t('legendFinal')}</span>
              </span>
              <span className="flex items-center space-x-1.5 space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
                <span>{t('legendRedecoded')}</span>
              </span>
              <span className="flex items-center space-x-1.5 space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-cyan-400/90 animate-pulse"></span>
                <span>{t('legendProvisional')}</span>
              </span>
            </div>

            {/* Live Streaming Active Status Indicator (compact pill when speaking) */}
            {isRecording && hasUncommitted && (
              <div className="flex items-center space-x-2.5 space-x-reverse px-3.5 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs shadow-sm mb-2 w-fit animate-glow-pulse">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="font-medium text-[11px]">
                  {t('liveStreamPill')}: {t('listening')}
                </span>
                <span className="inline-block w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
              </div>
            )}

            {/* Complete Word Flow */}
            <div
              className="text-lg leading-relaxed text-slate-100 flex flex-wrap gap-x-1.5 gap-y-1.5"
              dir={language === 'fa' || activeLanguage === 'fa' ? 'rtl' : 'ltr'}
            >
              {/* 1. Finalized Committed words (Immutable, stable text) */}
              {committedWords.map((word, idx) => (
                <WordSpan
                  key={`commit-${idx}-${Math.round(word.start * 100)}`}
                  word={word}
                  visualState="committed"
                  showTimestamp={showTimestamps}
                />
              ))}

              {/* 2. Tracked Provisional words with Telegram-style revision diffing */}
              {trackedProvisionalWords.map((word) => (
                <WordSpan
                  key={word.id}
                  word={word}
                  visualState={word.visualState}
                  showTimestamp={showTimestamps}
                />
              ))}

              {/* Live typing pulse cursor when recording */}
              {isRecording && (
                <span className="inline-block w-1.5 h-5 bg-cyan-400 rounded-full animate-cursor-blink self-center mr-0.5" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Jump to Latest Button when user scrolled up */}
      {isUserScrolledUp && isRecording && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-1.5 space-x-reverse px-3.5 py-1.5 rounded-full bg-cyan-500 text-slate-950 font-bold text-xs shadow-xl shadow-cyan-500/30 hover:bg-cyan-400 transition-all hover:scale-105 z-20"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>{t('jumpToLatest')}</span>
        </button>
      )}
    </div>
  );
};

interface WordSpanProps {
  word: WordItem;
  visualState: 'committed' | 'provisional-new' | 'provisional-corrected' | 'provisional-stable';
  showTimestamp: boolean;
}

const WordSpan: React.FC<WordSpanProps> = ({ word, visualState, showTimestamp }) => {
  // Distinguish English/Latin terms for bidi isolation
  const isEnglishOrNumber = /^[a-zA-Z0-9.,!?'-]+$/.test(word.text);

  let styleClasses = 'text-slate-100';
  if (visualState === 'provisional-corrected') {
    styleClasses =
      'text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-lg border border-amber-400/40 font-semibold animate-word-corrected shadow-sm shadow-amber-500/20';
  } else if (visualState === 'provisional-new') {
    styleClasses = 'text-cyan-400 font-medium animate-word-appear';
  } else if (visualState === 'provisional-stable') {
    styleClasses = 'text-cyan-300/90 font-medium';
  } else {
    // Committed final words: clean, high readability, zero distracting styles
    styleClasses = 'text-slate-100 hover:text-cyan-200 transition-colors';
  }

  return (
    <span
      className={`relative group inline-flex items-baseline ${styleClasses}`}
      dir={isEnglishOrNumber ? 'ltr' : undefined}
      style={isEnglishOrNumber ? { unicodeBidi: 'isolate' } : undefined}
    >
      <span>{word.text}</span>

      {showTimestamp && (
        <span className="text-[10px] font-mono text-slate-500 mr-1 select-none" dir="ltr">
          [{word.start.toFixed(1)}s]
        </span>
      )}

      {/* Timestamp tooltip on hover */}
      <span
        className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-navy-950 border border-slate-700 text-[10px] font-mono text-cyan-300 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30"
        dir="ltr"
      >
        {word.start.toFixed(2)}s - {word.end.toFixed(2)}s
      </span>
    </span>
  );
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
