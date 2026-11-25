import React, { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Copy,
  Check,
  ClipboardPaste,
  X,
  Mic,
  Pause,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import {
  AudioLevelPayload,
  CommitEventPayload,
  PartialEventPayload,
  WordItem,
} from '../../types/asr';
import { wordsToPlainString } from '../../utils/exportFormats';
import { formatPersianTranscript } from '../../utils/persianTypography';
import {
  mergeCommittedWords,
  filterUncommittedWords,
  deduplicateConsecutiveSentences,
} from '../../utils/wordDeduplication';
import { useLanguage } from '../../i18n/LanguageContext';

export const QuickDictationOverlay: React.FC = () => {
  const { language } = useLanguage();

  const [isRecording, setIsRecording] = useState<boolean>(true);
  const [overlayState, setOverlayState] = useState<'recording' | 'result' | 'pasted' | 'error'>('recording');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [isUserEditing, setIsUserEditing] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<AudioLevelPayload>({
    rms: 0,
    peak: 0,
    db: -96,
    isSpeech: false,
  });

  const [committedWords, setCommittedWords] = useState<WordItem[]>([]);
  const [openWords, setOpenWords] = useState<WordItem[]>([]);
  const [tailWords, setTailWords] = useState<WordItem[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [waveTick, setWaveTick] = useState(0);

  const committedWordsRef = useRef<WordItem[]>([]);
  const openWordsRef = useRef<WordItem[]>([]);
  const tailWordsRef = useRef<WordItem[]>([]);
  const isUserEditingRef = useRef<boolean>(false);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    committedWordsRef.current = committedWords;
  }, [committedWords]);

  useEffect(() => {
    openWordsRef.current = openWords;
  }, [openWords]);

  useEffect(() => {
    tailWordsRef.current = tailWords;
  }, [tailWords]);

  useEffect(() => {
    isUserEditingRef.current = isUserEditing;
  }, [isUserEditing]);

  // Check state on mount
  useEffect(() => {
    startTimeRef.current = Date.now();
    invoke<string>('get_quick_dictation_state')
      .then((st) => {
        if (st === 'result') {
          setIsRecording(false);
          setOverlayState('result');
        } else if (st === 'error') {
          setIsRecording(false);
          setOverlayState('error');
        } else {
          setIsRecording(true);
          setOverlayState('recording');
        }
      })
      .catch(() => {
        setIsRecording(true);
        setOverlayState('recording');
      });
  }, []);

  // Keyboard shortcut listener (Escape to close, Ctrl+Enter to paste)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transcriptText]);

  // Smooth 30fps waveform animation ticker while recording
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setWaveTick((prev) => (prev + 1) % 100000);
    }, 33);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Auto-scroll textarea as text arrives if user is not manually editing
  useEffect(() => {
    if (textareaRef.current && !isUserEditing) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [transcriptText, isUserEditing]);

  // Listen to IPC events from Rust core
  useEffect(() => {
    const unlistens: Array<() => void> = [];

    async function initListeners() {
      const uStarted = await listen<string>('quick-dictation://started', () => {
        setCommittedWords([]);
        committedWordsRef.current = [];
        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];
        setTranscriptText('');
        setIsUserEditing(false);
        isUserEditingRef.current = false;
        setErrorMessage(null);
        setIsRecording(true);
        setOverlayState('recording');
        setRecordingSeconds(0);
        startTimeRef.current = Date.now();
      });
      unlistens.push(uStarted);

      const uStatus = await listen<{ status: string }>('asr://status', (event) => {
        if (event.payload.status === 'recording') {
          setIsRecording(true);
          setOverlayState('recording');
          if (!startTimeRef.current) startTimeRef.current = Date.now();
        }
      });
      unlistens.push(uStatus);

      const uPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        const rawOpen = event.payload.open || [];
        const rawTail = event.payload.tail || [];

        const cleanOpen = filterUncommittedWords(rawOpen, committedWordsRef.current);
        const cleanTail = filterUncommittedWords(rawTail, committedWordsRef.current, cleanOpen);

        setOpenWords(cleanOpen);
        openWordsRef.current = cleanOpen;
        setTailWords(cleanTail);
        tailWordsRef.current = cleanTail;

        if (!isUserEditingRef.current) {
          const all = [...committedWordsRef.current, ...cleanOpen, ...cleanTail];
          const raw = wordsToPlainString(all);
          const formatted = formatPersianTranscript(raw);
          const cleanFormatted = deduplicateConsecutiveSentences(formatted);
          setTranscriptText(cleanFormatted);
        }
      });
      unlistens.push(uPartial);

      const uCommit = await listen<CommitEventPayload>('asr://commit', (event) => {
        if (event.payload.words && event.payload.words.length > 0) {
          const merged = mergeCommittedWords(committedWordsRef.current, event.payload.words);
          committedWordsRef.current = merged;
          setCommittedWords(merged);

          const cleanOpen = filterUncommittedWords(openWordsRef.current, merged);
          const cleanTail = filterUncommittedWords(tailWordsRef.current, merged, cleanOpen);
          setOpenWords(cleanOpen);
          openWordsRef.current = cleanOpen;
          setTailWords(cleanTail);
          tailWordsRef.current = cleanTail;

          if (!isUserEditingRef.current) {
            const all = [...merged, ...cleanOpen, ...cleanTail];
            const raw = wordsToPlainString(all);
            const formatted = formatPersianTranscript(raw);
            const cleanFormatted = deduplicateConsecutiveSentences(formatted);
            setTranscriptText(cleanFormatted);
          }
        }
      });
      unlistens.push(uCommit);

      const uFinalized = await listen('quick-dictation://finalized', () => {
        setIsRecording(false);
        setOverlayState('result');

        let finalFormatted = '';
        if (!isUserEditingRef.current) {
          const cleanOpen = filterUncommittedWords(openWordsRef.current, committedWordsRef.current);
          const cleanTail = filterUncommittedWords(tailWordsRef.current, committedWordsRef.current, cleanOpen);
          const all = [
            ...committedWordsRef.current,
            ...cleanOpen,
            ...cleanTail,
          ];
          const raw = wordsToPlainString(all);
          const formatted = formatPersianTranscript(raw);
          finalFormatted = deduplicateConsecutiveSentences(formatted);
          setTranscriptText(finalFormatted);
        }

        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];

        const textToSave = finalFormatted || textareaRef.current?.value || '';
        if (textToSave.trim().length > 0) {
          const duration = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 1.0;
          const locale = language === 'fa' ? 'fa-IR' : 'en-US';
          invoke('save_transcript', {
            record: {
              id: crypto.randomUUID(),
              title: `Quick Dictation - ${new Date().toLocaleTimeString(locale)}`,
              text: textToSave,
              srtContent: null,
              language: 'fa',
              durationSecs: duration,
              wordCount: textToSave.trim().split(/\s+/).length,
              createdAt: new Date().toLocaleDateString(locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          }).catch(console.error);
        }
      });
      unlistens.push(uFinalized);

      const uDismissed = await listen('quick-dictation://dismissed', () => {
        setCommittedWords([]);
        committedWordsRef.current = [];
        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];
      });
      unlistens.push(uDismissed);

      const uError = await listen<string>('quick-dictation://error', (event) => {
        setErrorMessage(event.payload);
        setIsRecording(false);
        setOverlayState('error');
      });
      unlistens.push(uError);

      const uLevel = await listen<AudioLevelPayload>('audio://level', (event) => {
        setAudioLevel(event.payload);
      });
      unlistens.push(uLevel);
    }

    initListeners();

    return () => {
      unlistens.forEach((fn) => fn());
    };
  }, [language]);

  // Duration timer
  useEffect(() => {
    if (isRecording) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setRecordingSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handleStop = async () => {
    try {
      setIsRecording(false);
      setOverlayState('result');
      await invoke('stop_quick_dictation_session');
    } catch (err) {
      console.error('Failed to stop dictation:', err);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_quick_dictation_session');
    } catch (err) {
      console.error('Failed to cancel dictation:', err);
    }
  };

  const handleRecordAgain = async () => {
    try {
      setIsUserEditing(false);
      isUserEditingRef.current = false;
      setIsRecording(true);
      setOverlayState('recording');
      await invoke('start_quick_dictation_session');
    } catch (err) {
      console.error('Failed to record again:', err);
    }
  };

  const handleCopy = async () => {
    const text = transcriptText || textareaRef.current?.value || '';
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaste = async () => {
    const text = transcriptText || textareaRef.current?.value || '';
    if (!text.trim()) return;
    try {
      setPasted(true);
      await invoke('trigger_quick_dictation_paste', { text });
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  // Compute smooth dual SVG sine wave paths reactive to live microphone audio level
  const { primaryWavePath, secondaryWavePath } = useMemo(() => {
    const width = 460;
    const midY = 34;
    const steps = 92;

    const dbEnergy = Math.max(0, Math.min(1, (audioLevel.db + 58.0) / 42.0));
    const rmsEnergy = Math.min(1, audioLevel.rms * 32.0);
    const speechEnergy = isRecording
      ? Math.max(0.14, Math.max(dbEnergy, rmsEnergy))
      : 0.04;

    const phase = waveTick * 0.22;
    const pts1: string[] = [];
    const pts2: string[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (t * width).toFixed(1);
      // Gaussian bell centered at 0.5 so peaks rise cleanly inside the glowing center orb
      const dist = (t - 0.5) * 2.0;
      const envelope = Math.exp(-dist * dist * 4.5);

      const carrier1 =
        Math.sin(t * Math.PI * 14 - phase) * 0.65 +
        Math.sin(t * Math.PI * 24 + phase * 1.4) * 0.35;
      const carrier2 =
        Math.sin(t * Math.PI * 10 + phase * 0.8) * 0.6 +
        Math.cos(t * Math.PI * 18 - phase * 1.1) * 0.4;

      const amp1 = 26 * speechEnergy * envelope;
      const amp2 = 16 * speechEnergy * envelope;

      const y1 = (midY + carrier1 * amp1).toFixed(1);
      const y2 = (midY + carrier2 * amp2).toFixed(1);

      pts1.push(`${i === 0 ? 'M' : 'L'}${x},${y1}`);
      pts2.push(`${i === 0 ? 'M' : 'L'}${x},${y2}`);
    }

    return {
      primaryWavePath: pts1.join(' '),
      secondaryWavePath: pts2.join(' '),
    };
  }, [audioLevel.db, audioLevel.rms, isRecording, waveTick]);

  const wordCount = transcriptText.trim().length > 0 ? transcriptText.trim().split(/\s+/).length : 0;

  return (
    <div
      className="w-screen h-screen p-1.5 select-none overflow-hidden flex items-center justify-center bg-transparent"
      dir={language === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* Low-transparency Dark Frosted Glass Modal matching macOS reference aesthetic */}
      <div className="w-full max-w-[548px] h-[328px] bg-[#111116]/[0.94] backdrop-blur-2xl border border-white/[0.14] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.09)] flex flex-col justify-between relative overflow-hidden text-slate-100 font-sans">
        {/* Subtle violet specular top accent */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-400/50 to-transparent pointer-events-none" />

        {/* 1. macOS-style Slim Top Title Strip */}
        <div
          data-tauri-drag-region
          dir="ltr"
          className="h-8 px-3.5 bg-white/[0.03] border-b border-white/[0.07] flex items-center justify-between shrink-0"
        >
          <div data-tauri-drag-region className="flex items-center space-x-2">
            {/* Traffic-light controls */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleCancel}
                className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all cursor-pointer"
                title={language === 'fa' ? 'بستن (Esc)' : 'Close (Esc)'}
                aria-label="Close"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/85" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/85" />
            </div>
            <span data-tauri-drag-region className="text-[11px] font-semibold text-slate-200 tracking-wide pl-1.5">
              VoxaLocal Dictate
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="font-mono text-[10px] text-slate-400 bg-white/[0.05] px-1.5 py-0.5 rounded">
              {formatDuration(recordingSeconds)}
            </span>
            <button
              onClick={handleCancel}
              className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors cursor-pointer"
              title="Esc"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {overlayState === 'error' ? (
          /* ================= ERROR VIEW ================= */
          <div className="flex flex-col flex-1 justify-between p-4">
            <div className="flex items-center space-x-2 space-x-reverse text-rose-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4" />
              <span>{language === 'fa' ? 'خطای دیکته صوتی' : 'Dictation Error'}</span>
            </div>
            <div className="flex-1 my-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 font-mono overflow-y-auto">
              {errorMessage || (language === 'fa' ? 'خطایی در ضبط صدا رخ داد.' : 'Recording error occurred.')}
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-medium cursor-pointer"
              >
                {language === 'fa' ? 'بستن' : 'Close'}
              </button>
            </div>
          </div>
        ) : overlayState === 'pasted' ? (
          /* ================= PASTED VIEW ================= */
          <div className="flex flex-col flex-1 items-center justify-center text-center p-4">
            <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-2 shadow-[0_0_18px_rgba(16,185,129,0.35)]">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-slate-100">
              {language === 'fa' ? 'متن در برنامه درج شد' : 'Pasted into active app'}
            </p>
          </div>
        ) : (
          /* ================= MAIN INTERACTIVE VIEW ================= */
          <div className="flex flex-col flex-1 min-h-0 px-4 pt-2.5 pb-3 justify-between">
            {/* 2. Centered Recording Status + Glowing Violet Circular Waveform */}
            <div className="flex flex-col items-center shrink-0">
              <div className="flex items-center space-x-1.5 space-x-reverse text-[11px] font-medium mb-1">
                <span className="relative flex h-2 w-2">
                  {isRecording && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isRecording
                        ? 'bg-violet-500 shadow-[0_0_10px_#8b5cf6]'
                        : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    }`}
                  />
                </span>
                <span className={isRecording ? 'text-slate-200' : 'text-emerald-300'}>
                  {isRecording
                    ? language === 'fa'
                      ? 'در حال شنیدن...'
                      : 'Recording...'
                    : language === 'fa'
                      ? 'آماده ویرایش و کپی'
                      : 'Ready to edit & copy'}
                </span>
              </div>

              {/* Center Luminous Purple Ring + Smooth SVG Wave */}
              <div className="relative w-full h-[68px] flex items-center justify-center overflow-hidden">
                {/* Ambient purple radial glow */}
                <div
                  className={`absolute w-24 h-24 rounded-full blur-xl pointer-events-none transition-opacity duration-300 ${
                    isRecording ? 'bg-violet-600/25 opacity-100' : 'bg-emerald-500/15 opacity-50'
                  }`}
                />
                {/* Crisp outer circle */}
                <div
                  className={`absolute w-16 h-16 rounded-full border pointer-events-none transition-all duration-300 ${
                    isRecording
                      ? 'border-violet-400/50 shadow-[0_0_24px_rgba(139,92,246,0.45),inset_0_0_14px_rgba(139,92,246,0.2)]'
                      : 'border-white/15 shadow-none'
                  }`}
                />
                <svg
                  viewBox="0 0 460 68"
                  className="w-full h-full relative z-10 overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <filter id="violet-glow" x="-10%" y="-40%" width="120%" height="180%">
                      <feGaussianBlur stdDeviation="2.4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.15" />
                      <stop offset="30%" stopColor="#8b5cf6" stopOpacity="0.85" />
                      <stop offset="50%" stopColor="#c084fc" stopOpacity="1" />
                      <stop offset="70%" stopColor="#8b5cf6" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.15" />
                    </linearGradient>
                  </defs>
                  <path
                    d={secondaryWavePath}
                    fill="none"
                    stroke="#7c3aed"
                    strokeOpacity="0.4"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                  <path
                    d={primaryWavePath}
                    fill="none"
                    stroke="url(#wave-grad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    filter="url(#violet-glow)"
                  />
                </svg>
              </div>
            </div>

            {/* 3. Clean Editable Transcript Area */}
            <div className="relative flex-1 min-h-0 my-1 flex flex-col">
              <textarea
                ref={textareaRef}
                value={transcriptText}
                onChange={(e) => {
                  setIsUserEditing(true);
                  setTranscriptText(e.target.value);
                }}
                onFocus={() => setIsUserEditing(true)}
                dir="auto"
                className="w-full flex-1 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-violet-400/50 text-slate-100 text-[13.5px] leading-relaxed resize-none font-sans select-text focus:outline-none transition-colors"
                placeholder={
                  language === 'fa'
                    ? 'صحبت کنید؛ متن به صورت زنده اینجا ظاهر می‌شود و قابل ویرایش است...'
                    : 'Speak now; your live transcription appears here and can be edited directly...'
                }
              />
            </div>

            {/* 4. Bottom Centered Floating Frosted Pill Controls */}
            <div className="flex items-center justify-center pt-1 shrink-0 relative">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1a1a23]/95 border border-white/[0.12] shadow-[0_8px_24px_rgba(0,0,0,0.65)]">
                {/* Glowing Purple Mic / Record Toggle */}
                <button
                  onClick={isRecording ? handleStop : handleRecordAgain}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isRecording
                      ? 'bg-gradient-to-tr from-violet-600 to-purple-500 text-white shadow-[0_0_16px_rgba(139,92,246,0.75)]'
                      : 'bg-white/[0.08] hover:bg-violet-500/30 text-violet-300 border border-violet-400/30'
                  }`}
                  title={
                    isRecording
                      ? language === 'fa'
                        ? 'توقف و بازبینی'
                        : 'Stop & Review'
                      : language === 'fa'
                        ? 'ضبط مجدد'
                        : 'Record Again'
                  }
                >
                  {isRecording ? <Mic className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>

                {/* Pause / Stop */}
                {isRecording && (
                  <button
                    onClick={handleStop}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                    title={language === 'fa' ? 'توقف ضبط' : 'Pause / Stop'}
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}

                <div className="w-[1px] h-4 bg-white/[0.1] mx-0.5" />

                {/* Language indicator */}
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-300 tracking-wider">
                  {language === 'fa' ? 'FA/EN' : 'EN/FA'}
                </span>

                {/* Copy Button */}
                <button
                  onClick={handleCopy}
                  disabled={!transcriptText.trim()}
                  className={`flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-white/[0.06] hover:bg-white/[0.14] text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed'
                  }`}
                  title={language === 'fa' ? 'کپی متن' : 'Copy Text'}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>
                    {copied ? (language === 'fa' ? 'کپی شد' : 'Copied') : language === 'fa' ? 'کپی' : 'Copy'}
                  </span>
                </button>

                {/* Paste into active app */}
                {!isRecording && (
                  <button
                    onClick={handlePaste}
                    disabled={!transcriptText.trim()}
                    className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-full bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/30 text-violet-200 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                    title="Ctrl+Enter"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>{pasted ? (language === 'fa' ? 'درج شد' : 'Pasted') : language === 'fa' ? 'درج' : 'Paste'}</span>
                  </button>
                )}

                {/* Close Esc */}
                <button
                  onClick={handleCancel}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer"
                  title="Esc"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Word count pill aligned quietly on the end */}
              {!isRecording && wordCount > 0 && (
                <span className="absolute end-0 text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                  {wordCount} {language === 'fa' ? 'کلمه' : 'w'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
