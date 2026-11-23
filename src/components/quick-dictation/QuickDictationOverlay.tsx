import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Copy,
  Check,
  ClipboardPaste,
  ExternalLink,
  X,
  Mic,
  Square,
  AlertCircle,
} from 'lucide-react';
import {
  AudioLevelPayload,
  CommitEventPayload,
  PartialEventPayload,
  WordItem,
  QuickDictationSettings,
} from '../../types/asr';
import { wordsToPlainString } from '../../utils/exportFormats';
import { formatPersianTranscript } from '../../utils/persianTypography';
import { useLanguage } from '../../i18n/LanguageContext';

export const QuickDictationOverlay: React.FC = () => {
  const { t, language } = useLanguage();

  const [overlayState, setOverlayState] = useState<'idle' | 'recording' | 'result' | 'pasted' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<AudioLevelPayload>({
    rms: 0,
    peak: 0,
    db: -96,
    isSpeech: false,
  });

  const [committedWords, setCommittedWords] = useState<WordItem[]>([]);
  const [openWords, setOpenWords] = useState<WordItem[]>([]);
  const [tailWords, setTailWords] = useState<WordItem[]>([]);
  const [resultText, setResultText] = useState<string>('');
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [waveTick, setWaveTick] = useState(0);

  const [settings, setSettings] = useState<QuickDictationSettings>({
    enabled: true,
    shortcut: 'Ctrl+Shift+B',
    mode: 'toggle',
    autoPaste: true,
    timeoutSeconds: 15,
    showWaveform: true,
  });

  const committedWordsRef = useRef<WordItem[]>([]);
  const openWordsRef = useRef<WordItem[]>([]);
  const tailWordsRef = useRef<WordItem[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoCloseRemaining, setAutoCloseRemaining] = useState<number | null>(null);

  useEffect(() => {
    committedWordsRef.current = committedWords;
  }, [committedWords]);

  useEffect(() => {
    openWordsRef.current = openWords;
  }, [openWords]);

  useEffect(() => {
    tailWordsRef.current = tailWords;
  }, [tailWords]);

  // Load Quick Dictation settings
  useEffect(() => {
    invoke<QuickDictationSettings>('get_quick_dictation_settings')
      .then((s) => setSettings(s))
      .catch((err) => console.error('Failed to load quick dictation settings:', err));

    invoke<'idle' | 'starting' | 'recording' | 'finalizing' | 'result' | 'cancelled' | 'error'>(
      'get_quick_dictation_state'
    )
      .then((st) => {
        if (st === 'recording') {
          setOverlayState('recording');
          if (!startTimeRef.current) startTimeRef.current = Date.now();
        } else {
          setOverlayState('idle');
        }
      })
      .catch(console.error);
  }, []);

  // Keyboard shortcut listener (Escape to cancel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Waveform animation ticker
  useEffect(() => {
    if (overlayState !== 'recording') return;
    const interval = setInterval(() => {
      setWaveTick((prev) => (prev + 1) % 10000);
    }, 40);
    return () => clearInterval(interval);
  }, [overlayState]);

  // Auto-scroll transcript container to bottom as words arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [committedWords, openWords, tailWords]);

  // Listen to IPC events
  useEffect(() => {
    let unlistens: Array<() => void> = [];

    async function initListeners() {
      // 1. Session started by global shortcut or button
      const uStarted = await listen<string>('quick-dictation://started', () => {
        setCommittedWords([]);
        committedWordsRef.current = [];
        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];
        setResultText('');
        setErrorMessage(null);
        setOverlayState('recording');
        setRecordingSeconds(0);
        startTimeRef.current = Date.now();
        if (autoCloseTimerRef.current) clearInterval(autoCloseTimerRef.current);
        setAutoCloseRemaining(null);
      });
      unlistens.push(uStarted);

      // 2. Partial streaming words (real-time live streaming hypothesis)
      const uPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        const open = event.payload.open || [];
        const tail = event.payload.tail || [];
        setOpenWords(open);
        openWordsRef.current = open;
        setTailWords(tail);
        tailWordsRef.current = tail;
      });
      unlistens.push(uPartial);

      // 3. Commit finalized words
      const uCommit = await listen<CommitEventPayload>('asr://commit', (event) => {
        if (event.payload.words && event.payload.words.length > 0) {
          setCommittedWords((prev) => {
            const merged = [...prev, ...event.payload.words];
            committedWordsRef.current = merged;
            return merged;
          });
          setOpenWords([]);
          openWordsRef.current = [];
          setTailWords([]);
          tailWordsRef.current = [];
        }
      });
      unlistens.push(uCommit);

      // 4. Session finalized (shortcut released or stop triggered)
      const uFinalized = await listen('quick-dictation://finalized', () => {
        // Collect all words without losing any words still in open or tail
        const all = [
          ...committedWordsRef.current,
          ...openWordsRef.current,
          ...tailWordsRef.current,
        ];
        const raw = wordsToPlainString(all);
        const formatted = formatPersianTranscript(raw);
        setResultText(formatted);
        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];

        invoke<QuickDictationSettings>('get_quick_dictation_settings')
          .then((cfg) => {
            if (cfg.autoPaste && formatted.trim().length > 0) {
              setOverlayState('pasted');
              invoke('trigger_quick_dictation_paste', { text: formatted });
              setTimeout(() => {
                invoke('dismiss_quick_dictation');
              }, 700);
            } else {
              setOverlayState('result');
            }
          })
          .catch(() => {
            setOverlayState('result');
          });

        // Save session to history as quick_dictation
        if (all.length > 0) {
          const duration = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 1.0;
          const locale = language === 'fa' ? 'fa-IR' : 'en-US';
          invoke('save_transcript', {
            record: {
              id: crypto.randomUUID(),
              title: `Quick Dictation - ${new Date().toLocaleTimeString(locale)}`,
              text: formatted,
              srtContent: null,
              language: 'fa',
              durationSecs: duration,
              wordCount: all.length,
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

      // 5. Dismissed / Hidden
      const uDismissed = await listen('quick-dictation://dismissed', () => {
        setCommittedWords([]);
        committedWordsRef.current = [];
        setOpenWords([]);
        openWordsRef.current = [];
        setTailWords([]);
        tailWordsRef.current = [];
      });
      unlistens.push(uDismissed);

      // 6. Errors
      const uError = await listen<string>('quick-dictation://error', (event) => {
        setErrorMessage(event.payload);
        setOverlayState('error');
      });
      unlistens.push(uError);

      // 7. Audio level
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
    if (overlayState === 'recording') {
      startTimeRef.current = startTimeRef.current || Date.now();
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
  }, [overlayState]);

  // Auto-close timer in result mode
  useEffect(() => {
    if (overlayState === 'result' && settings.timeoutSeconds > 0) {
      let remaining = settings.timeoutSeconds;
      setAutoCloseRemaining(remaining);
      autoCloseTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        setAutoCloseRemaining(remaining);
        if (remaining <= 0) {
          if (autoCloseTimerRef.current) clearInterval(autoCloseTimerRef.current);
          handleCancel();
        }
      }, 1000);
    }
    return () => {
      if (autoCloseTimerRef.current) clearInterval(autoCloseTimerRef.current);
    };
  }, [overlayState, settings.timeoutSeconds]);

  const handleStop = async () => {
    try {
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

  const handleCopy = async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaste = async () => {
    if (!resultText) return;
    try {
      setPasted(true);
      await invoke('trigger_quick_dictation_paste', { text: resultText });
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const handleOpenInStudio = async () => {
    try {
      await invoke('open_in_studio');
    } catch (err) {
      console.error('Failed to open studio:', err);
    }
  };

  // Generate 36 dynamic equalizer bars
  const totalBars = 36;
  const bars = Array.from({ length: totalBars });

  const hasAnyWords = committedWords.length > 0 || openWords.length > 0 || tailWords.length > 0;

  return (
    <div className="w-screen h-screen p-2 select-none overflow-hidden flex items-center justify-center bg-transparent">
      {/* Sleek Floating Pill Container - 100% Solid Opaque Background (Zero Bleed-through) */}
      <div className="w-full max-w-[540px] h-[175px] bg-[#1a1b1e] border border-slate-700/90 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] flex flex-col justify-between p-3.5 relative overflow-hidden text-slate-100 font-sans">
        {/* Subtle top inner light highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

        {/* ================= STATE 1: RECORDING / LIVE WORD-BY-WORD STREAM ================= */}
        {(overlayState === 'recording' || overlayState === 'idle') && (
          <div className="flex flex-col h-full justify-between">
            {/* Top Header Bar: Status, Duration & Close Button (X) */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08] text-xs">
              {/* Left: Recording Pulse & Status */}
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="relative flex h-2.5 w-2.5">
                  {overlayState === 'recording' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${overlayState === 'recording' ? 'bg-rose-500' : 'bg-cyan-400'}`}></span>
                </span>
                <span className="text-cyan-300 font-bold text-xs tracking-wide">
                  {overlayState === 'recording'
                    ? (language === 'fa' ? 'در حال شنیدن و بازشناسی زنده...' : 'Listening & transcribing live...')
                    : (language === 'fa' ? 'دیکته صوتی آماده است...' : 'Quick Dictation Ready...')}
                </span>
                <span className="font-mono text-slate-400 text-[11px]" dir="ltr">
                  ({formatDuration(overlayState === 'recording' ? recordingSeconds : 0)})
                </span>
              </div>

              {/* Right: Dedicated Close Button (X) */}
              <button
                onClick={handleCancel}
                className="p-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
                title={language === 'fa' ? 'بستن و لغو (Esc)' : 'Close and Cancel (Esc)'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Center Area: Real-Time Word Stream (Telegram Style / TinyASR Native) */}
            <div
              ref={scrollRef}
              className="flex-1 my-1 px-2 overflow-y-auto text-sm md:text-base leading-relaxed flex flex-wrap gap-x-0.5 gap-y-1 content-start items-center"
              dir="auto"
            >
              {!hasAnyWords ? (
                <div className="flex items-center justify-center space-x-2 space-x-reverse text-slate-400 text-xs py-2 w-full animate-pulse select-none">
                  <Mic className="w-4 h-4 text-cyan-400" />
                  <span>
                    {language === 'fa'
                      ? 'صحبت کنید؛ کلمات شما بی‌درنگ و کلمه به کلمه اینجا تایپ می‌شوند...'
                      : 'Speak now; your words will be typed here in real time...'}
                  </span>
                </div>
              ) : (
                <>
                  {/* 1. Finalized Committed words (clean crisp solid text) */}
                  {committedWords.map((word, idx) => (
                    <span
                      key={`comm-${idx}-${word.start}`}
                      className="text-slate-100 font-medium tracking-normal"
                    >
                      {idx > 0 && !word.join ? ' ' : ''}{word.text}
                    </span>
                  ))}

                  {/* 2. Re-decoded current sentence (Open words) */}
                  {openWords.map((word, idx) => (
                    <span
                      key={`open-${idx}-${word.start}`}
                      className="text-slate-100 font-medium tracking-normal"
                    >
                      {(committedWords.length > 0 || idx > 0) && !word.join ? ' ' : ''}{word.text}
                    </span>
                  ))}

                  {/* 3. Live Streaming words (Tail words typed immediately in real time!) */}
                  {tailWords.map((word, idx) => (
                    <span
                      key={`tail-${idx}-${word.start}`}
                      className="text-cyan-300 font-semibold animate-word-appear"
                    >
                      {(committedWords.length > 0 || openWords.length > 0 || idx > 0) && !word.join ? ' ' : ''}{word.text}
                    </span>
                  ))}

                  {/* Pulsing blinking typing cursor */}
                  <span className="inline-block w-1.5 h-4.5 bg-cyan-400 rounded-full animate-cursor-blink self-center ms-1 shadow-[0_0_8px_#22d3ee]" />
                </>
              )}
            </div>

            {/* Bottom Bar: Soundwave Equalizer & Action Buttons */}
            <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.08] text-xs">
              {/* Dynamic Soundwave Equalizer */}
              <div className="flex items-center gap-[3px] h-7 px-1" dir="ltr">
                {bars.map((_, i) => {
                  const normDist = Math.abs(i - 17.5) / 18.0;
                  const envelope = Math.pow(Math.cos(normDist * Math.PI * 0.48), 1.1);

                  // Normalized audio energy from dB and RMS (sensitive to any mic)
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

              {/* Right Action Buttons */}
              <div className="flex items-center space-x-2 space-x-reverse">
                <button
                  onClick={handleStop}
                  className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer"
                  title="Stop recording"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{language === 'fa' ? 'توقف و درج' : 'Stop & Paste'}</span>
                </button>

                <button
                  onClick={handleCancel}
                  className="flex items-center space-x-1 space-x-reverse px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-slate-200 border border-white/10 text-xs transition-colors cursor-pointer"
                  title="Cancel (Esc)"
                >
                  <span>{language === 'fa' ? 'لغو' : 'Cancel'}</span>
                  <span className="font-mono text-[10px] text-slate-500">Esc</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STATE 2: AUTO-PASTED NOTIFICATION ================= */}
        {overlayState === 'pasted' && (
          <div className="flex flex-col h-full items-center justify-center text-center p-3 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-2">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-slate-100">
              {language === 'fa' ? 'متن با موفقیت جای‌گذاری شد' : 'Pasted into application'}
            </p>
            <p className="text-xs text-slate-300 truncate max-w-md mt-1" dir="auto">
              «{resultText}»
            </p>
          </div>
        )}

        {/* ================= STATE 3: RESULT REVIEW MODE ================= */}
        {overlayState === 'result' && (
          <div className="flex flex-col h-full justify-between">
            {/* Header */}
            <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.08]">
              <span className="text-cyan-300 font-bold text-xs flex items-center space-x-1.5 space-x-reverse">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('dictationComplete')}</span>
              </span>

              <div className="flex items-center space-x-2 space-x-reverse">
                {autoCloseRemaining !== null && autoCloseRemaining > 0 && (
                  <span className="text-[10px] font-mono text-slate-400 bg-white/[0.05] px-1.5 py-0.5 rounded">
                    {autoCloseRemaining}s
                  </span>
                )}
                <button
                  onClick={handleCancel}
                  className="p-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Editable Text Area */}
            <textarea
              value={resultText}
              onChange={(e) => {
                setResultText(e.target.value);
                if (autoCloseTimerRef.current) clearInterval(autoCloseTimerRef.current);
                setAutoCloseRemaining(null);
              }}
              className="flex-1 my-1.5 text-xs md:text-sm text-slate-100 leading-relaxed p-2 bg-[#121316] rounded-xl border border-white/10 focus:outline-none focus:border-cyan-500/50 resize-none"
              dir="auto"
              placeholder="متن رونویسی شده..."
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.08]">
              <div className="flex items-center space-x-1.5 space-x-reverse">
                <button
                  onClick={handlePaste}
                  className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{pasted ? t('pasted') : t('pasteToApp')}</span>
                </button>

                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg bg-[#28292d] hover:bg-[#323439] text-slate-200 text-xs transition-colors border border-white/10 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? t('copied') : t('copyText')}</span>
                </button>
              </div>

              <button
                onClick={handleOpenInStudio}
                className="flex items-center space-x-1 space-x-reverse text-[11px] text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                <span>{t('openInStudio')}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STATE 4: ERROR MODE ================= */}
        {overlayState === 'error' && (
          <div className="flex flex-col h-full justify-between p-1">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-rose-500/20">
              <span className="text-rose-400 font-bold text-xs flex items-center space-x-1.5 space-x-reverse">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>خطای دیکته صوتی</span>
              </span>
              <button
                onClick={handleCancel}
                className="p-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 my-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 font-mono overflow-y-auto">
              {errorMessage || 'خطایی در راه‌اندازی ضبط رخ داده است.'}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
              >
                بستن (Close)
              </button>
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
