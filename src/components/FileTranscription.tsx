import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  FileAudio,
  UploadCloud,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  Copy,
  Download,
  Save,
  Sparkles,
  Radio,
  Clock,
} from 'lucide-react';
import {
  FileTranscriptionResult,
  FileWaveformInfo,
  FileTranscribeProgressPayload,
  WordItem,
} from '../types/asr';
import { exportAsFile, wordsToPlainString } from '../utils/exportFormats';
import { formatPersianTranscript } from '../utils/persianTypography';
import { useLanguage } from '../i18n/LanguageContext';

interface FileTranscriptionProps {
  onSaveToHistory: (title: string, text: string, srt: string) => Promise<void>;
  isModelLoaded: boolean;
}

export const FileTranscription: React.FC<FileTranscriptionProps> = ({
  onSaveToHistory,
  isModelLoaded,
}) => {
  const { t, language } = useLanguage();

  const [filePath, setFilePath] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [languageMode, setLanguageMode] = useState<'fa' | 'en' | 'fa,en'>('fa');
  const [beamWidth, setBeamWidth] = useState<number>(4);

  // Waveform state
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [durationSecs, setDurationSecs] = useState<number>(0);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState<boolean>(false);

  // Live transcription state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentSecs, setCurrentSecs] = useState<number>(0);
  const [liveWords, setLiveWords] = useState<WordItem[]>([]);
  const [, setActiveJobId] = useState<string | null>(null);

  // Final result state
  const [result, setResult] = useState<FileTranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'text' | 'timestamps' | 'srt'>('text');
  const [usePersianTypography, setUsePersianTypography] = useState<boolean>(true);

  const liveScrollRef = useRef<HTMLDivElement>(null);
  const unlistensRef = useRef<Array<() => void>>([]);

  // Auto-scroll the live words box as new words arrive
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveWords]);

  // Clean up Tauri event listeners on unmount
  useEffect(() => {
    return () => {
      unlistensRef.current.forEach((u) => u());
      unlistensRef.current = [];
    };
  }, []);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${String(m).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  // Select an audio file and load its waveform
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg'] }],
      });

      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        const name = selected.split(/[\\/]/).pop() || selected;
        setFileName(name);
        setResult(null);
        setError(null);
        setLiveWords([]);
        setProgress(0);
        setCurrentSecs(0);

        // Fetch waveform peaks and duration from backend
        setIsLoadingWaveform(true);
        try {
          const info = await invoke<FileWaveformInfo>('get_audio_file_waveform', {
            filePath: selected,
            numBars: 72,
          });
          setWaveformPeaks(info.peaks);
          setDurationSecs(info.durationSecs);
        } catch (e: any) {
          console.error('Failed to get audio waveform:', e);
          // Fallback to placeholder peaks if decoding failed
          const fallback = Array.from({ length: 72 }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i * 0.25)));
          setWaveformPeaks(fallback);
        } finally {
          setIsLoadingWaveform(false);
        }
      }
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };

  // Start asynchronous non-blocking file transcription
  const handleStartTranscribe = async () => {
    if (!filePath) {
      setError(
        language === 'fa'
          ? 'لطفاً ابتدا یک فایل صوتی انتخاب کنید.'
          : 'Please select an audio file first.'
      );
      return;
    }
    if (!isModelLoaded) {
      setError(
        language === 'fa'
          ? 'مدل هنوز در حافظه RAM بارگذاری نشده است. لطفاً ابتدا در تب مدیریت مدل‌ها آن را بارگذاری کنید.'
          : 'Model is not loaded in RAM. Please load models in the Model Manager tab.'
      );
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setLiveWords([]);
    setProgress(0);
    setCurrentSecs(0);

    // Clean up previous listeners if any
    unlistensRef.current.forEach((u) => u());
    unlistensRef.current = [];

    try {
      // 1. Listen for streaming progress & real-time words
      const uProgress = await listen<FileTranscribeProgressPayload>(
        'file-transcribe://progress',
        (event) => {
          setProgress(event.payload.progress);
          setCurrentSecs(event.payload.currentSecs);
          if (event.payload.totalSecs > 0) {
            setDurationSecs(event.payload.totalSecs);
          }
          if (event.payload.newWords && event.payload.newWords.length > 0) {
            setLiveWords((prev) => [...prev, ...event.payload.newWords]);
          }
        }
      );
      unlistensRef.current.push(uProgress);

      // 2. Listen for completion
      const uDone = await listen<FileTranscriptionResult>('file-transcribe://done', (event) => {
        setProgress(1.0);
        setCurrentSecs(event.payload.durationSecs);
        setDurationSecs(event.payload.durationSecs);
        setResult(event.payload);
        setIsProcessing(false);
        setActiveJobId(null);
      });
      unlistensRef.current.push(uDone);

      // 3. Listen for errors
      const uError = await listen<string>('file-transcribe://error', (event) => {
        setError(event.payload);
        setIsProcessing(false);
        setActiveJobId(null);
      });
      unlistensRef.current.push(uError);

      // 4. Listen for cancellation
      const uCancelled = await listen<string>('file-transcribe://cancelled', () => {
        setIsProcessing(false);
        setActiveJobId(null);
      });
      unlistensRef.current.push(uCancelled);

      // Start non-blocking background job
      const jobId = await invoke<string>('start_file_transcription', {
        filePath,
        languageMode,
        beamWidth,
      });
      setActiveJobId(jobId);
    } catch (err: any) {
      setError(String(err));
      setIsProcessing(false);
    }
  };

  // Cancel in-progress transcription
  const handleCancelTranscribe = async () => {
    try {
      await invoke('cancel_file_transcription');
      setIsProcessing(false);
      setActiveJobId(null);
    } catch (err) {
      console.error('Failed to cancel transcription:', err);
    }
  };

  const handleCopy = async () => {
    const textToCopy = result
      ? usePersianTypography && (language === 'fa' || languageMode === 'fa')
        ? formatPersianTranscript(result.text)
        : result.text
      : wordsToPlainString(liveWords);

    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const title = `${fileName}`;
      const textToSave =
        usePersianTypography && (language === 'fa' || languageMode === 'fa')
          ? formatPersianTranscript(result.text)
          : result.text;

      await onSaveToHistory(title, textToSave, result.srtContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const livePlainText = wordsToPlainString(liveWords);
  const formattedLiveText =
    usePersianTypography && (language === 'fa' || languageMode === 'fa')
      ? formatPersianTranscript(livePlainText)
      : livePlainText;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* File Upload / Picker Card */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-xl p-4 sm:p-5 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center space-x-2.5 space-x-reverse">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <FileAudio className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100">{t('fileTransTitle')}</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">{t('fileTransSubtitle')}</p>
            </div>
          </div>

          {durationSecs > 0 && (
            <div className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-lg bg-navy-950/80 border border-slate-800 text-[11px] text-slate-300 font-mono">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>{t('audioDuration')}:</span>
              <span className="text-cyan-300 font-semibold" dir="ltr">
                {formatTime(durationSecs)}
              </span>
            </div>
          )}
        </div>

        {/* Dropzone container */}
        <div
          onClick={handleSelectFile}
          className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-navy-950/70 hover:bg-navy-950/90 p-4 sm:p-6 rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center text-center mt-2 shadow-inner group"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-2 shadow-lg shadow-cyan-500/10 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-5 h-5 text-cyan-400" />
          </div>
          {fileName ? (
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-cyan-300 font-mono" dir="ltr">
                {fileName}
              </p>
              <p className="text-[11px] text-slate-500 max-w-lg truncate" dir="ltr">
                {filePath}
              </p>
              <span className="inline-block mt-1 text-[11px] text-cyan-400 underline font-medium">
                {t('changeFile')}
              </span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-medium text-slate-200">{t('dropzoneTitle')}</p>
              <p className="text-[11px] text-slate-500">{t('dropzoneSubtitle')}</p>
            </div>
          )}
        </div>

        {/* Telegram-style Voice Message Waveform Visualizer */}
        {(waveformPeaks.length > 0 || isLoadingWaveform) && (
          <div className="mt-4 p-3.5 rounded-xl bg-navy-950/90 border border-slate-800/90 space-y-2.5 shadow-inner">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="text-slate-400 font-medium">{t('waveformProgress')}</span>
                {isProcessing && (
                  <span className="inline-flex items-center space-x-1 space-x-reverse px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] animate-pulse">
                    <Radio className="w-3 h-3 text-cyan-400 animate-spin" />
                    <span>{t('transcribingFile')}</span>
                  </span>
                )}
              </div>

              {/* Progress & Time Counter */}
              <div className="flex items-center space-x-2 space-x-reverse font-mono text-xs">
                <span className="text-slate-400" dir="ltr">
                  {formatTime(currentSecs)} / {formatTime(durationSecs)}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-400 font-bold" dir="ltr">
                  {Math.round(progress * 100)}%
                </span>
              </div>
            </div>

            {/* Telegram-style Variable Height Vertical Bars */}
            <div className="flex items-center justify-between gap-[2px] h-11 px-2 py-1 bg-navy-950/60 rounded-lg overflow-hidden border border-slate-800/60 relative">
              {isLoadingWaveform ? (
                <div className="w-full flex items-center justify-center text-xs text-slate-500 animate-pulse">
                  در حال استخراج امواج صوتی فایل...
                </div>
              ) : (
                waveformPeaks.map((peak, idx) => {
                  const barProgress = idx / Math.max(1, waveformPeaks.length - 1);
                  const isDone = barProgress <= progress || progress >= 0.999;
                  // Height scale: 15% to 100% of container
                  const heightPx = Math.max(6, Math.round(peak * 34));

                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-full transition-all duration-150 ${
                        isDone
                          ? 'bg-gradient-to-t from-cyan-500 to-cyan-400 shadow-[0_0_5px_rgba(6,182,212,0.4)]'
                          : 'bg-slate-700/80 hover:bg-slate-600'
                      }`}
                      style={{ height: `${heightPx}px` }}
                      title={`${((idx / waveformPeaks.length) * durationSecs).toFixed(1)}s`}
                    />
                  );
                })
              )}
            </div>

            {/* Sub-bar legend */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <div className="flex items-center space-x-3 space-x-reverse">
                <span className="flex items-center space-x-1 space-x-reverse">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                  <span className="text-slate-300">پردازش‌شده (آبی)</span>
                </span>
                <span className="flex items-center space-x-1 space-x-reverse">
                  <span className="w-2 h-2 rounded-full bg-slate-700" />
                  <span>باقی‌مانده (خاکستری)</span>
                </span>
              </div>
              <div>
                {liveWords.length > 0 && (
                  <span className="text-cyan-300 font-mono font-medium">
                    {liveWords.length} {t('transcribedWordsCount')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3.5 border-t border-slate-800">
          <div>
            <label className="text-xs text-slate-400 block mb-1">{t('transcriptionLang')}</label>
            <select
              value={languageMode}
              onChange={(e) => setLanguageMode(e.target.value as any)}
              disabled={isProcessing}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
            >
              <option value="fa">{t('langPersian')}</option>
              <option value="en">{t('langEnglish')}</option>
              <option value="fa,en">{t('langBoth')}</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">{t('beamWidthLabel')}</label>
            <select
              value={beamWidth}
              onChange={(e) => setBeamWidth(Number(e.target.value))}
              disabled={isProcessing}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
            >
              <option value={1}>{t('beamGreedy')}</option>
              <option value={2}>{t('beamFast')}</option>
              <option value={4}>{t('beamDefault')}</option>
            </select>
          </div>

          <div className="flex items-end space-x-2 space-x-reverse">
            {!isProcessing ? (
              <button
                onClick={handleStartTranscribe}
                disabled={isProcessing || !filePath}
                className="w-full flex items-center justify-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 disabled:opacity-40 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t('startFileTranscribe')}</span>
              </button>
            ) : (
              <button
                onClick={handleCancelTranscribe}
                className="w-full flex items-center justify-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs transition-all shadow-lg shadow-rose-500/10"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>{t('cancelTranscribe')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 space-x-reverse">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Real-time Streaming Words Display (shown while transcribing or if live words exist) */}
      {(isProcessing || (liveWords.length > 0 && !result)) && (
        <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md space-y-3 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2.5 space-x-reverse">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-100">{t('liveWordsStream')}</h3>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                {liveWords.length} کلمه
              </span>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse text-xs text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>

          {/* Real-time streaming container with auto-scroll */}
          <div
            ref={liveScrollRef}
            className="p-4 bg-navy-950/80 rounded-xl max-h-64 overflow-y-auto font-sans text-sm leading-relaxed text-slate-200 select-text border border-slate-800/60 shadow-inner"
            dir={language === 'fa' || languageMode === 'fa' ? 'rtl' : 'ltr'}
          >
            {formattedLiveText ? (
              <span>
                {formattedLiveText}
                {isProcessing && (
                  <span className="inline-block w-1.5 h-4 bg-cyan-400 rounded-full animate-cursor-blink align-middle mr-1.5" />
                )}
              </span>
            ) : (
              <span className="text-slate-500 text-xs italic">
                در حال پردازش و استخراج نخستین کلمات فایل...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Transcription Result Card */}
      {result && (
        <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-4 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-wrap gap-3">
            <div className="flex items-center space-x-4 space-x-reverse">
              <span className="text-xs text-slate-400">
                {t('fileDuration')}{' '}
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {result.durationSecs.toFixed(1)}s
                </span>
              </span>
              <span className="text-xs text-slate-400">
                {t('wordCount')}:{' '}
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {result.words.length}
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse flex-wrap gap-2">
              {/* Persian typography toggle */}
              <button
                onClick={() => setUsePersianTypography(!usePersianTypography)}
                className={`flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                  usePersianTypography
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                    : 'bg-navy-950 border-slate-800 text-slate-400'
                }`}
                title="اعمال خودکار نیم‌فاصله و استانداردسازی حروف فارسی"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>نیم‌فاصله هوشمند</span>
              </button>

              {/* Tab Selector */}
              <div className="flex bg-navy-950 p-0.5 rounded-lg border border-slate-800 text-xs shadow-inner">
                <button
                  onClick={() => setActiveView('text')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'text'
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {t('fullTextTab')}
                </button>
                <button
                  onClick={() => setActiveView('timestamps')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'timestamps'
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {t('timestampsTab')}
                </button>
                <button
                  onClick={() => setActiveView('srt')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'srt'
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {t('srtTab')}
                </button>
              </div>

              {/* Copy */}
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors shadow-sm"
              >
                {copied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? t('copied') : t('copyText')}</span>
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 transition-colors shadow-sm"
              >
                {saved ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saved ? t('saved') : t('saveToHistory')}</span>
              </button>

              {/* Export SRT */}
              <button
                onClick={() => exportAsFile(result.srtContent, `${fileName}.srt`)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-sm"
                title="Download SRT"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View Mode Contents */}
          {activeView === 'text' && (
            <div
              className="p-4 bg-navy-950/70 rounded-xl text-base text-slate-100 leading-relaxed max-h-96 overflow-y-auto select-text font-sans shadow-inner whitespace-pre-wrap"
              dir={language === 'fa' || languageMode === 'fa' ? 'rtl' : 'ltr'}
            >
              {usePersianTypography && (language === 'fa' || languageMode === 'fa')
                ? formatPersianTranscript(result.text)
                : result.text}
            </div>
          )}

          {activeView === 'timestamps' && (
            <div className="p-3 bg-navy-950/70 rounded-xl max-h-96 overflow-y-auto font-mono text-xs text-slate-300 shadow-inner">
              <div className="grid grid-cols-4 gap-2 pb-2 mb-2 border-b border-slate-800 text-slate-500 font-sans">
                <span>{t('wordCol')}</span>
                <span>{t('startCol')}</span>
                <span>{t('endCol')}</span>
                <span>{t('durationCol')}</span>
              </div>
              {result.words.map((w, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-4 gap-2 py-1 border-b border-slate-800/40 hover:bg-slate-800/30"
                  dir="ltr"
                >
                  <span className="font-sans text-slate-200">{w.text}</span>
                  <span className="text-cyan-400">{w.start.toFixed(2)}s</span>
                  <span className="text-cyan-400">{w.end.toFixed(2)}s</span>
                  <span className="text-slate-400">{(w.end - w.start).toFixed(2)}s</span>
                </div>
              ))}
            </div>
          )}

          {activeView === 'srt' && (
            <pre
              className="p-4 bg-navy-950/70 rounded-xl text-xs text-cyan-300/90 font-mono max-h-96 overflow-y-auto select-text leading-relaxed shadow-inner"
              dir="ltr"
            >
              {result.srtContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
