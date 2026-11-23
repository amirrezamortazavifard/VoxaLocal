import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Copy,
  Check,
  ClipboardPaste,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  AudioLevelPayload,
  CommitEventPayload,
  PartialEventPayload,
  TrackedWordItem,
  WordItem,
  QuickDictationSettings,
} from '../../types/asr';
import { trackProvisionalWords, pruneExpiredVisualStates } from '../../utils/wordDiffTracker';
import { wordsToPlainString } from '../../utils/exportFormats';
import { formatPersianTranscript } from '../../utils/persianTypography';
import { useLanguage } from '../../i18n/LanguageContext';

export const QuickDictationOverlay: React.FC = () => {
  const { t, language } = useLanguage();

  const [overlayState, setOverlayState] = useState<'recording' | 'result' | 'idle' | 'pasted'>('idle');
  const [audioLevel, setAudioLevel] = useState<AudioLevelPayload>({
    rms: 0,
    peak: 0,
    db: -96,
    isSpeech: false,
  });

  const [committedWords, setCommittedWords] = useState<WordItem[]>([]);
  const [trackedProvisionalWords, setTrackedProvisionalWords] = useState<TrackedWordItem[]>([]);
  const [resultText, setResultText] = useState<string>('');
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [waveTick, setWaveTick] = useState(0);

  const [settings, setSettings] = useState<QuickDictationSettings>({
    enabled: true,
    shortcut: 'Ctrl+Shift+Space',
    mode: 'pushToTalk',
    autoPaste: true,
    timeoutSeconds: 15,
    showWaveform: true,
  });

  const committedWordsRef = useRef<WordItem[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const [autoCloseRemaining, setAutoCloseRemaining] = useState<number | null>(null);

  useEffect(() => {
    committedWordsRef.current = committedWords;
  }, [committedWords]);

  // Load Quick Dictation settings
  useEffect(() => {
    invoke<QuickDictationSettings>('get_quick_dictation_settings')
      .then((s) => setSettings(s))
      .catch((err) => console.error('Failed to load quick dictation settings:', err));
  }, []);

  // Keyboard shortcut listener (Escape to cancel, Space/Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Animation frame ticker for smooth waveform movement
  useEffect(() => {
    if (overlayState !== 'recording') return;
    const interval = setInterval(() => {
      setWaveTick((prev) => (prev + 1) % 10000);
    }, 40);
    return () => clearInterval(interval);
  }, [overlayState]);

  // Listen to IPC events
  useEffect(() => {
    let unlistens: Array<() => void> = [];

    async function initListeners() {
      // 1. Session started by global shortcut
      const uStarted = await listen<string>('quick-dictation://started', () => {
        setCommittedWords([]);
        committedWordsRef.current = [];
        setTrackedProvisionalWords([]);
        setResultText('');
        setOverlayState('recording');
        setRecordingSeconds(0);
        startTimeRef.current = Date.now();
        if (autoCloseTimerRef.current) clearInterval(autoCloseTimerRef.current);
        setAutoCloseRemaining(null);
      });
      unlistens.push(uStarted);

      // 2. Partial streaming words
      const uPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        const open = event.payload.open || [];
        const tail = event.payload.tail || [];
        setTrackedProvisionalWords((prev) =>
          trackProvisionalWords(prev, open, tail, committedWordsRef.current)
        );
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
          setTrackedProvisionalWords([]);
        }
      });
      unlistens.push(uCommit);

      // 4. Session finalized (shortcut released or stop triggered)
      const uFinalized = await listen('quick-dictation://finalized', () => {
        const all = committedWordsRef.current;
        const raw = wordsToPlainString(all);
        const formatted = formatPersianTranscript(raw);
        setResultText(formatted);
        setTrackedProvisionalWords([]);

        // Auto-paste if enabled in settings
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

      // 5. Dismissed
      const uDismissed = await listen('quick-dictation://dismissed', () => {
        setOverlayState('idle');
      });
      unlistens.push(uDismissed);

      // 6. Audio level
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

  // Recording duration timer
  useEffect(() => {
    if (overlayState === 'recording') {
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

  // Visual state expiration ticker
  useEffect(() => {
    if (overlayState !== 'recording') return;
    const ticker = setInterval(() => {
      setTrackedProvisionalWords((prev) => pruneExpiredVisualStates(prev));
    }, 150);
    return () => clearInterval(ticker);
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
          handleDismiss();
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

  const handleDismiss = async () => {
    try {
      await invoke('dismiss_quick_dictation');
    } catch (err) {
      console.error('Failed to dismiss overlay:', err);
    }
  };

  // Generate 42 symmetrical waveform bars matching Image 1
  const totalBars = 42;
  const bars = Array.from({ length: totalBars });

  const allWords = [...committedWords, ...trackedProvisionalWords];
  const hasWords = allWords.length > 0;
  const latestWordsString = allWords
    .slice(-7)
    .map((w) => w.text)
    .join(' ');

  return (
    <div className="w-screen h-screen p-2 select-none overflow-hidden flex items-center justify-center bg-transparent">
      {/* Sleek Floating Pill Container matching Image 1 */}
      <div className="w-full max-w-[500px] h-[145px] bg-[#18191c]/98 border border-white/10 rounded-[26px] backdrop-blur-2xl shadow-2xl flex flex-col justify-between p-3.5 relative overflow-hidden text-slate-100 font-sans">
        {/* Subtle top inner light highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        {/* State A: Recording / Streaming Mode */}
        {overlayState === 'recording' && (
          <div className="flex flex-col h-full justify-between">
            {/* Top / Center Area: Dynamic Waveform & Live Words */}
            <div className="relative flex-1 flex flex-col items-center justify-center pt-1 pb-1">
              {/* Optional live provisional transcript overlay */}
              {hasWords && (
                <div
                  className="absolute top-0 inset-x-0 text-center text-xs font-medium text-cyan-300/90 truncate px-4 pointer-events-none z-10 animate-fade-in"
                  dir={language === 'fa' ? 'rtl' : 'ltr'}
                >
                  {latestWordsString}
                </div>
              )}

              {/* Symmetrical vertical soundwave bars matching Image 1 */}
              <div className="flex items-center justify-center gap-[3.5px] h-16 w-full px-2" dir="ltr">
                {bars.map((_, i) => {
                  const normDist = Math.abs(i - 20.5) / 21.0;
                  // Cosine envelope: high in center, smoothly tapered at edges
                  const envelope = Math.pow(Math.cos(normDist * Math.PI * 0.48), 1.25);

                  let barHeightPercent: number;
                  if (audioLevel.isSpeech || audioLevel.rms > 0.015) {
                    const wavePhase = Math.sin(i * 0.45 + waveTick * 0.3) * 0.3 + 0.7;
                    const dynamicGain = Math.min(100, (audioLevel.rms * 380) * envelope * wavePhase);
                    barHeightPercent = Math.max(14, Math.min(96, Math.round(16 + dynamicGain)));
                  } else {
                    // Soft ambient idle breathing
                    const idlePhase = Math.sin(i * 0.3 + waveTick * 0.12) * 4;
                    barHeightPercent = Math.max(10, Math.round(18 * envelope + idlePhase));
                  }

                  return (
                    <div
                      key={i}
                      className="w-[3px] rounded-full bg-white transition-all duration-75 shadow-sm"
                      style={{
                        height: `${barHeightPercent}%`,
                        opacity: 0.85 + (barHeightPercent / 100) * 0.15,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bottom Action Bar matching Image 1 */}
            <div className="flex items-center justify-between px-2 pt-2 border-t border-white/[0.07] text-xs">
              {/* Left: Brand Delta Glyph */}
              <div className="flex items-center space-x-2 text-slate-400">
                <svg
                  className="w-4 h-4 text-slate-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3L2 20h20L12 3z" />
                </svg>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatDuration(recordingSeconds)}
                </span>
              </div>

              {/* Right: Stop & Cancel Action Badges */}
              <div className="flex items-center space-x-3 text-xs text-slate-400">
                {/* Stop Button & Key Badges */}
                <button
                  onClick={handleStop}
                  className="flex items-center space-x-1.5 text-slate-300 hover:text-white transition-colors group cursor-pointer"
                  title="Stop recording"
                >
                  <span className="text-[11px] text-slate-400 group-hover:text-slate-200 font-medium">
                    {language === 'fa' ? 'توقف' : 'Stop'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#28292d] text-slate-300 border border-white/10 font-mono text-[10px] shadow-sm">
                    ^
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#28292d] text-slate-300 border border-white/10 font-mono text-[10px] shadow-sm">
                    Space
                  </span>
                </button>

                {/* Cancel Button & Key Badge */}
                <button
                  onClick={handleDismiss}
                  className="flex items-center space-x-1.5 text-slate-400 hover:text-rose-300 transition-colors group cursor-pointer"
                  title="Cancel and dismiss (Esc)"
                >
                  <span className="text-[11px] text-slate-400 group-hover:text-rose-300 font-medium">
                    {language === 'fa' ? 'لغو' : 'Cancel'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#28292d] text-slate-400 group-hover:text-rose-300 border border-white/10 font-mono text-[10px] shadow-sm">
                    esc
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State B: Auto-Pasted Notification */}
        {overlayState === 'pasted' && (
          <div className="flex flex-col h-full items-center justify-center text-center p-3 animate-fade-in">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-2">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-xs font-semibold text-slate-100">
              {language === 'fa' ? 'در برنامه جای‌گذاری شد' : 'Pasted into target app'}
            </p>
            <p className="text-[11px] text-slate-400 truncate max-w-sm mt-1" dir={language === 'fa' ? 'rtl' : 'ltr'}>
              {resultText}
            </p>
          </div>
        )}

        {/* State C: Result / Manual Action Mode */}
        {overlayState === 'result' && (
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.08]">
              <span className="text-cyan-300 font-semibold text-xs flex items-center space-x-1.5 space-x-reverse">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('dictationComplete')}</span>
              </span>

              {autoCloseRemaining !== null && autoCloseRemaining > 0 && (
                <span className="text-[10px] font-mono text-slate-400">
                  {autoCloseRemaining}s
                </span>
              )}

              <button
                onClick={handleDismiss}
                className="text-slate-400 hover:text-slate-200 p-0.5 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div
              className="flex-1 my-1.5 text-xs text-slate-100 overflow-y-auto leading-relaxed p-1.5 bg-[#121316] rounded-xl border border-white/5"
              dir={language === 'fa' ? 'rtl' : 'ltr'}
            >
              {resultText || (language === 'fa' ? 'متنی شناسایی نشد.' : 'No speech recognized.')}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/[0.08]">
              <div className="flex items-center space-x-1.5 space-x-reverse">
                <button
                  onClick={handlePaste}
                  className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-sm transition-all"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{pasted ? t('pasted') : t('pasteToApp')}</span>
                </button>

                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg bg-[#28292d] hover:bg-[#323439] text-slate-200 text-xs transition-colors border border-white/10"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? t('copied') : t('copyText')}</span>
                </button>
              </div>

              <button
                onClick={handleOpenInStudio}
                className="flex items-center space-x-1 space-x-reverse text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
              >
                <span>{t('openInStudio')}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* State D: Idle / Standby Mode */}
        {overlayState === 'idle' && (
          <div className="h-full flex flex-col justify-between">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="flex items-center justify-center gap-[3px] h-9 w-full px-4 mb-2 opacity-50" dir="ltr">
                {bars.slice(0, 32).map((_, i) => (
                  <div
                    key={i}
                    className="w-[2.5px] rounded-full bg-slate-500"
                    style={{ height: `${Math.max(15, Math.sin((i / 31) * Math.PI) * 70)}%` }}
                  />
                ))}
              </div>
              <p className="text-xs font-semibold text-slate-300">{t('quickDictationReady')}</p>
            </div>

            <div className="flex items-center justify-between px-2 pt-2 border-t border-white/[0.07] text-xs">
              <div className="flex items-center space-x-1.5 text-slate-400">
                <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3L2 20h20L12 3z" />
                </svg>
                <span className="text-[11px] text-slate-400">VoxaLocal</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] text-slate-400">{language === 'fa' ? 'میانبر:' : 'Shortcut:'}</span>
                <span className="px-2 py-0.5 rounded bg-[#28292d] text-slate-300 border border-white/10 font-mono text-[10px]">
                  {settings.shortcut}
                </span>
              </div>
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
