import React, { useState } from 'react';
import { Copy, Trash2, Download, Save, Check, Clock, Sparkles } from 'lucide-react';
import { WordItem } from '../types/asr';
import { formatPersianTranscript } from '../utils/persianTypography';
import { exportAsFile, exportWordsAsJson, generateSrtFromWords, wordsToPlainString } from '../utils/exportFormats';

interface TranscriptViewProps {
  committedWords: WordItem[];
  openWords: WordItem[];
  tailWords: WordItem[];
  allWords: WordItem[];
  status: string;
  activeLanguage: string;
  recordingDuration: number;
  onClear: () => void;
  onSaveToHistory: (title: string, text: string, srt: string) => Promise<void>;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  committedWords,
  openWords,
  tailWords,
  allWords,
  status,
  activeLanguage,
  recordingDuration,
  onClear,
  onSaveToHistory,
}) => {
  const [usePersianTypography, setUsePersianTypography] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const rawText = wordsToPlainString(allWords);
  const displayText = usePersianTypography ? formatPersianTranscript(rawText) : rawText;

  const handleCopy = async () => {
    if (!displayText) return;
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!allWords.length || isSaving) return;
    setIsSaving(true);
    try {
      const title = `رونویسی ${new Date().toLocaleTimeString('fa-IR')} (${allWords.length} کلمه)`;
      const srt = generateSrtFromWords(allWords);
      await onSaveToHistory(title, displayText, srt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save to history:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportTxt = () => {
    if (!displayText) return;
    const filename = `VoxLocal_Transcript_${Date.now()}.txt`;
    exportAsFile(displayText, filename);
  };

  const handleExportSrt = () => {
    if (!allWords.length) return;
    const srt = generateSrtFromWords(allWords);
    const filename = `VoxLocal_Subtitles_${Date.now()}.srt`;
    exportAsFile(srt, filename);
  };

  const handleExportJson = () => {
    if (!allWords.length) return;
    const json = exportWordsAsJson('VoxLocal Transcript', allWords, activeLanguage, recordingDuration);
    const filename = `VoxLocal_WordTimestamps_${Date.now()}.json`;
    exportAsFile(json, filename, 'application/json');
  };

  return (
    <div className="flex flex-col h-full bg-navy-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-md overflow-hidden shadow-2xl">
      {/* Workspace Sub-header Toolbar */}
      <div className="px-5 py-3 border-b border-slate-800/80 bg-navy-950/60 flex items-center justify-between">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="flex items-center space-x-1.5 space-x-reverse text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>مدت: {formatDuration(recordingDuration)}</span>
          </div>

          <span className="text-slate-700">|</span>

          <div className="text-xs text-slate-400">
            تعداد کلمات: <span className="font-mono text-cyan-300 font-semibold">{allWords.length}</span>
          </div>

          {openWords.length > 0 && (
            <div className="flex items-center space-x-1 space-x-reverse px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[11px] border border-cyan-500/20 animate-pulse">
              <Sparkles className="w-3 h-3" />
              <span>بازگشایی متن کامل (Re-decoding)</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 space-x-reverse">
          {/* Persian Typography Toggle */}
          <button
            onClick={() => setUsePersianTypography(!usePersianTypography)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              usePersianTypography
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="اصلاح نیم‌فاصله‌ها و کاراکترهای عربی به فارسی"
          >
            نیم‌فاصله هوشمند (ZWNJ)
          </button>

          {/* Timestamps view toggle */}
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              showTimestamps
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            برچسب زمانی
          </button>

          <span className="text-slate-700">|</span>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            disabled={!allWords.length}
            className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 disabled:opacity-40 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'کپی شد' : 'کپی متن'}</span>
          </button>

          {/* Save to History */}
          <button
            onClick={handleSave}
            disabled={!allWords.length || isSaving}
            className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 disabled:opacity-40 transition-colors"
          >
            {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saved ? 'ذخیره شد' : 'ذخیره در تاریخچه'}</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative group">
            <button
              disabled={!allWords.length}
              className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی</span>
            </button>
            <div className="absolute left-0 mt-1 w-36 bg-navy-950 border border-slate-800 rounded-xl shadow-xl py-1 hidden group-hover:block z-30">
              <button
                onClick={handleExportTxt}
                className="w-full text-right px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/70 hover:text-cyan-300"
              >
                متن خام (TXT)
              </button>
              <button
                onClick={handleExportSrt}
                className="w-full text-right px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/70 hover:text-cyan-300"
              >
                زیرنویس (SRT)
              </button>
              <button
                onClick={handleExportJson}
                className="w-full text-right px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/70 hover:text-cyan-300"
              >
                داده زمانی (JSON)
              </button>
            </div>
          </div>

          {/* Clear Button */}
          <button
            onClick={onClear}
            disabled={!allWords.length && status === 'idle'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 transition-colors"
            title="پاکسازی متن"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Transcript Body */}
      <div className="flex-1 p-6 overflow-y-auto leading-loose text-base font-sans select-text scroll-smooth">
        {allWords.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-16">
            <div className="w-16 h-16 rounded-2xl bg-navy-950 border border-slate-800 flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-300 mb-1">استودیو آماده ضبط است</p>
            <p className="text-xs text-slate-500 max-w-sm">
              دکمه قرمز ضبط را فشار دهید یا صحبت کنید. متن به صورت زنده و با بازگشایی خودکار هوشمند نمایان خواهد شد.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Legend info */}
            <div className="flex items-center space-x-4 space-x-reverse text-[11px] text-slate-400 pb-2 border-b border-slate-800/40">
              <span className="flex items-center space-x-1 space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                <span>کلمات نهایی‌شده (ثابت)</span>
              </span>
              <span className="flex items-center space-x-1 space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span>بازگشایی متن کامل (Re-decoded)</span>
              </span>
              <span className="flex items-center space-x-1 space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-cyan-300/60"></span>
                <span>جریان استریم موقت</span>
              </span>
            </div>

            {/* Word sequence rendering with visual states */}
            <div className="text-lg leading-relaxed text-slate-100 flex flex-wrap gap-x-1.5 gap-y-1">
              {/* 1. Finalized Committed words */}
              {committedWords.map((word, idx) => (
                <WordSpan
                  key={`commit-${idx}-${word.start}`}
                  word={word}
                  type="commit"
                  showTimestamp={showTimestamps}
                />
              ))}

              {/* 2. Re-decoded Open words */}
              {openWords.map((word, idx) => (
                <WordSpan
                  key={`open-${idx}-${word.start}`}
                  word={word}
                  type="open"
                  showTimestamp={showTimestamps}
                />
              ))}

              {/* 3. Streaming Tail words */}
              {tailWords.map((word, idx) => (
                <WordSpan
                  key={`tail-${idx}-${word.start}`}
                  word={word}
                  type="tail"
                  showTimestamp={showTimestamps}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface WordSpanProps {
  word: WordItem;
  type: 'commit' | 'open' | 'tail';
  showTimestamp: boolean;
}

const WordSpan: React.FC<WordSpanProps> = ({ word, type, showTimestamp }) => {
  const isEnglish = /^[a-zA-Z0-9.,!?'-]+$/.test(word.text);

  let styleClasses = 'text-slate-100';
  if (type === 'open') {
    styleClasses = 'text-cyan-300 bg-cyan-500/10 px-1 py-0.5 rounded border border-cyan-500/30 font-medium transition-all duration-150';
  } else if (type === 'tail') {
    styleClasses = 'text-cyan-400/80 italic animate-pulse';
  }

  return (
    <span
      className={`relative group inline-flex items-baseline ${styleClasses}`}
      dir={isEnglish ? 'ltr' : undefined}
    >
      <span>{word.text}</span>

      {showTimestamp && (
        <span className="text-[10px] font-mono text-slate-500 mr-1 select-none" dir="ltr">
          [{word.start.toFixed(1)}s]
        </span>
      )}

      {/* Timestamp tooltip on hover */}
      <span className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-navy-950 border border-slate-700 text-[10px] font-mono text-cyan-300 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30">
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
