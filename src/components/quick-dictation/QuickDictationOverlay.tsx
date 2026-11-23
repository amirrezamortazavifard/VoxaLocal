import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Copy,
  Check,
  ClipboardPaste,
  X,
  Mic,
  Square,
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

  // Waveform animation ticker
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setWaveTick((prev) => (prev + 1) % 10000);
    }, 40);
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
    let unlistens: Array<() => void> = [];

    async function initListeners() {
      // 1. Session started
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

      // 2. Engine status
      const uStatus = await listen<{ status: string }>('asr://status', (event) => {
        if (event.payload.status === 'recording') {
          setIsRecording(true);
          setOverlayState('recording');
          if (!startTimeRef.current) startTimeRef.current = Date.now();
        }
      });
      unlistens.push(uStatus);

      // 3. Partial streaming words (real-time live streaming)
      const uPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        const open = event.payload.open || [];
        const tail = event.payload.tail || [];
        setOpenWords(open);
        openWordsRef.current = open;
        setTailWords(tail);
        tailWordsRef.current = tail;

        // If user hasn't manually edited text, update live transcription
        if (!isUserEditingRef.current) {
          const all = [...committedWordsRef.current, ...open, ...tail];
          const raw = wordsToPlainString(all);
          const formatted = formatPersianTranscript(raw);
          setTranscriptText(formatted);
        }
      });
      unlistens.push(uPartial);

      // 4. Commit finalized words
      const uCommit = await listen<CommitEventPayload>('asr://commit', (event) => {
        if (event.payload.words && event.payload.words.length > 0) {
          const merged = [...committedWordsRef.current, ...event.payload.words];
          committedWordsRef.current = merged;
          setCommittedWords(merged);
          setOpenWords([]);
          openWordsRef.current = [];
          setTailWords([]);
          tailWordsRef.current = [];

          if (!isUserEditingRef.current) {
            const raw = wordsToPlainString(merged);
            const formatted = formatPersianTranscript(raw);
            setTranscriptText(formatted);
          }
        }
      });
      unlistens.push(uCommit);

      // 5. Session finalized (stop triggered)
      const uFinalized = await listen('quick-dictation://finalized', () => {
        setIsRecording(false);
        setOverlayState('result');

        let finalFormatted = '';
        if (!isUserEditingRef.current) {
          const all = [
            ...committedWordsRef.current,
            ...openWordsRef.current,
            ...tailWordsRef.current,
          ];
          const raw = wordsToPlainString(all);
          finalFormatted = formatPersianTranscript(raw);
          setTranscriptText(finalFormatted);
        }

        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];

        // Save session to history as quick_dictation
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

      // 6. Dismissed / Hidden
      const uDismissed = await listen('quick-dictation://dismissed', () => {
        setCommittedWords([]);
        committedWordsRef.current = [];
        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];
      });
      unlistens.push(uDismissed);

      // 7. Errors
      const uError = await listen<string>('quick-dictation://error', (event) => {
        setErrorMessage(event.payload);
        setIsRecording(false);
        setOverlayState('error');
      });
      unlistens.push(uError);

      // 8. Audio level
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

  // Generate 36 dynamic equalizer bars
  const totalBars = 36;
  const bars = Array.from({ length: totalBars });

  const wordCount = transcriptText.trim().length > 0 ? transcriptText.trim().split(/\s+/).length : 0;

  return (
    <div
      className="w-screen h-screen p-2 select-none overflow-hidden flex items-center justify-center bg-transparent"
      dir={language === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* Sleek Floating Pill Container - Glassmorphic Bottom Desktop Modal */}
      <div className="w-full max-w-[620px] h-[224px] bg-[#12141a]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95),0_0_25px_rgba(6,182,212,0.15)] flex flex-col justify-between p-3.5 relative overflow-hidden text-slate-100 font-sans">
        {/* Subtle top ambient cyan light highlight */}
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent pointer-events-none" />

        {overlayState === 'error' ? (
          /* ================= ERROR VIEW ================= */
          <div className="flex flex-col h-full justify-between p-1">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-rose-500/20">
              <span className="text-rose-400 font-bold text-xs flex items-center space-x-1.5 space-x-reverse">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>{language === 'fa' ? 'خطای دیکته صوتی' : 'Dictation Error'}</span>
              </span>
              <button
                onClick={handleCancel}
                className="p-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 my-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 font-mono overflow-y-auto">
              {errorMessage || (language === 'fa' ? 'خطایی در راه‌اندازی ضبط رخ داده است.' : 'An error occurred during dictation.')}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
              >
                {language === 'fa' ? 'بستن (Close)' : 'Close'}
              </button>
            </div>
          </div>
        ) : overlayState === 'pasted' ? (
          /* ================= PASTED NOTIFICATION VIEW ================= */
          <div className="flex flex-col h-full items-center justify-center text-center p-3 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-slate-100">
              {language === 'fa' ? 'متن با موفقیت در برنامه جای‌گذاری شد' : 'Pasted into application'}
            </p>
            <p className="text-xs text-slate-300 truncate max-w-md mt-1" dir="auto">
              «{transcriptText}»
            </p>
          </div>
        ) : (
          /* ================= MAIN INTERACTIVE VIEW (RECORDING + DIRECT EDITING + COPY) ================= */
          <div className="flex flex-col h-full justify-between">
            {/* Top Header Bar */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08] text-xs">
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="relative flex h-2.5 w-2.5">
                  {isRecording && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      isRecording ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    }`}
                  ></span>
                </span>
                <span className={`${isRecording ? 'text-cyan-300' : 'text-emerald-300'} font-bold text-xs tracking-wide`}>
                  {isRecording
                    ? (language === 'fa' ? 'در حال شنیدن و بازشناسی زنده...' : 'Listening & transcribing live...')
                    : (language === 'fa' ? 'رونویسی تکمیل شد (امکان ویرایش و کپی)' : 'Transcription complete (editable)')}
                </span>
                <span className="font-mono text-slate-400 text-[11px] bg-white/[0.05] px-1.5 py-0.5 rounded" dir="ltr">
                  {formatDuration(recordingSeconds)}
                </span>
              </div>

              {/* Close Button */}
              <button
                onClick={handleCancel}
                className="p-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
                title={language === 'fa' ? 'بستن (Esc)' : 'Close (Esc)'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Center Area: Live Real-Time & Directly Editable Textarea */}
            <div className="relative flex-1 my-1.5 w-full flex flex-col">
              <textarea
                ref={textareaRef}
                value={transcriptText}
                onChange={(e) => {
                  setIsUserEditing(true);
                  setTranscriptText(e.target.value);
                }}
                onFocus={() => {
                  // User clicked to edit
                  setIsUserEditing(true);
                }}
                dir="auto"
                className="w-full flex-1 p-2.5 rounded-xl bg-[#0a0b0e] border border-white/10 focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30 text-slate-100 text-sm leading-relaxed resize-none font-sans shadow-inner transition-all select-text focus:outline-none"
                placeholder={
                  language === 'fa'
                    ? 'صحبت کنید؛ کلمات شما بی‌درنگ اینجا ظاهر می‌شوند و می‌توانید مستقیماً آن‌ها را ویرایش کنید...'
                    : 'Speak now; words will appear here in real time and you can edit them directly...'
                }
              />
              {/* Subtle animated listening prompt if empty during recording */}
              {isRecording && !transcriptText && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center space-x-2 space-x-reverse text-slate-400 text-xs animate-pulse select-none">
                  <Mic className="w-4 h-4 text-cyan-400" />
                  <span>
                    {language === 'fa'
                      ? 'صحبت کنید؛ کلمات شما بی‌درنگ اینجا تایپ می‌شوند...'
                      : 'Speak now; your words appear here in real time...'}
                  </span>
                </div>
              )}
            </div>

            {/* Bottom Bar: Action Buttons & Equalizer / Stats */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.08] text-xs">
              {/* Action Buttons */}
              <div className="flex items-center space-x-2 space-x-reverse">
                {/* 1. Dedicated Copy Button - ALWAYS accessible! */}
                <button
                  onClick={handleCopy}
                  disabled={!transcriptText.trim()}
                  className={`flex items-center space-x-1.5 space-x-reverse px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
                    copied
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-emerald-500/25'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 disabled:opacity-35 disabled:cursor-not-allowed'
                  }`}
                  title={language === 'fa' ? 'کپی کردن متن در کلیپ‌بورد' : 'Copy text to clipboard'}
                >
                  {copied ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? (language === 'fa' ? 'کپی شد!' : 'Copied!') : (language === 'fa' ? 'کپی متن' : 'Copy Text')}</span>
                </button>

                {/* 2. Stop or Record Again */}
                {isRecording ? (
                  <button
                    onClick={handleStop}
                    className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-xl bg-[#23252b] hover:bg-[#2c2e36] text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
                    title="توقف ضبط صدا"
                  >
                    <Square className="w-3 h-3 fill-current text-rose-400" />
                    <span>{language === 'fa' ? 'توقف ضبط' : 'Stop'}</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleRecordAgain}
                      className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10 text-xs font-semibold transition-all cursor-pointer"
                      title="شروع مجدد ضبط صدا"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                      <span>{language === 'fa' ? 'ضبط مجدد' : 'Record Again'}</span>
                    </button>

                    <button
                      onClick={handlePaste}
                      disabled={!transcriptText.trim()}
                      className="flex items-center space-x-1 space-x-reverse px-2.5 py-1.5 rounded-xl bg-[#23252b] hover:bg-[#2c2e36] text-slate-200 text-xs transition-colors border border-white/10 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                      title="درج مستقیم در برنامه فعال (Ctrl+Enter)"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{pasted ? (language === 'fa' ? 'جای‌گذاری شد!' : 'Pasted!') : (language === 'fa' ? 'درج در برنامه' : 'Paste')}</span>
                    </button>
                  </>
                )}

                {/* Close Button (Esc) */}
                <button
                  onClick={handleCancel}
                  className="flex items-center space-x-1 space-x-reverse px-2 py-1.5 rounded-xl bg-transparent hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
                  title="بستن (Esc)"
                >
                  <span>{language === 'fa' ? 'بستن' : 'Close'}</span>
                  <span className="font-mono text-[10px] text-slate-500">Esc</span>
                </button>
              </div>

              {/* Right Side: Soundwave Equalizer (while recording) OR Word Count (when stopped) */}
              {isRecording ? (
                <div className="flex items-center gap-[3px] h-6 px-1" dir="ltr">
                  {bars.map((_, i) => {
                    const normDist = Math.abs(i - 17.5) / 18.0;
                    const envelope = Math.pow(Math.cos(normDist * Math.PI * 0.48), 1.1);

                    const dbEnergy = Math.max(0, Math.min(1, (audioLevel.db + 58.0) / 45.0));
                    const rmsEnergy = Math.min(1, audioLevel.rms * 35.0);
                    const speechEnergy = Math.max(dbEnergy, rmsEnergy);
                    const isAudioActive = audioLevel.isSpeech || speechEnergy > 0.08 || audioLevel.rms > 0.0025 || audioLevel.db > -55.0;

                    let barHeightPercent: number;
                    if (isAudioActive) {
                      const wavePhase = Math.sin(i * 0.5 + waveTick * 0.35) * 0.35 + 0.65;
                      const dynamicGain = Math.min(85, speechEnergy * 90 * envelope * wavePhase);
                      barHeightPercent = Math.max(14, Math.min(95, Math.round(14 + dynamicGain)));
                    } else {
                      const idlePhase = Math.sin(i * 0.35 + waveTick * 0.12) * 3;
                      barHeightPercent = Math.max(10, Math.round(15 * envelope + idlePhase));
                    }

                    return (
                      <div
                        key={i}
                        className="w-[2.5px] rounded-full bg-cyan-400 transition-all duration-75 shadow-sm"
                        style={{
                          height: `${barHeightPercent}%`,
                          opacity: 0.6 + (barHeightPercent / 100) * 0.4,
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center space-x-2 space-x-reverse text-[11px] text-slate-400">
                  <span className="bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/5">
                    {wordCount} {language === 'fa' ? 'کلمه' : 'words'}
                  </span>
                </div>
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
