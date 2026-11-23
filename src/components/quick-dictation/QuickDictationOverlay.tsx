import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Mic,
  Copy,
  Check,
  ClipboardPaste,
  ExternalLink,
  X,
  Radio,
  Clock,
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

  const [overlayState, setOverlayState] = useState<'recording' | 'result' | 'idle'>('idle');
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
  const [settings, setSettings] = useState<QuickDictationSettings>({
    enabled: true,
    shortcut: 'Ctrl+Shift+Space',
    mode: 'pushToTalk',
    autoPaste: false,
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
        setOverlayState('result');
        setTrackedProvisionalWords([]);

        // Build final text
        const all = committedWordsRef.current;
        const raw = wordsToPlainString(all);
        const formatted = formatPersianTranscript(raw);
        setResultText(formatted);

        // Auto-paste if enabled in settings
        invoke<QuickDictationSettings>('get_quick_dictation_settings')
          .then((cfg) => {
            if (cfg.autoPaste && formatted.trim().length > 0) {
              invoke('trigger_quick_dictation_paste', { text: formatted });
            }
          })
          .catch(() => {});

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

  // Audio waveform calculation
  const clampedDb = Math.max(-60, Math.min(0, audioLevel.db));
  const normalizedLevel = (clampedDb + 60) / 60; // 0.0 to 1.0

  return (
    <div className="w-screen h-screen p-2 select-none overflow-hidden flex items-center justify-center bg-transparent">
      <div className="w-full h-full bg-navy-950/95 border border-cyan-500/30 rounded-2xl backdrop-blur-xl shadow-2xl flex flex-col justify-between overflow-hidden text-slate-100 font-sans p-4 relative">
        {/* State A: Recording / Streaming Mode */}
        {overlayState === 'recording' && (
          <div className="flex flex-col h-full justify-between">
            {/* Header info */}
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80">
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <span className="text-cyan-300 font-semibold">{t('quickDictationActive')}</span>
              </div>

              {/* Live Audio Level Meter */}
              {settings.showWaveform && (
                <div className="flex items-center space-x-1 space-x-reverse w-24 h-2 bg-navy-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-75"
                    style={{ width: `${Math.round(normalizedLevel * 100)}%` }}
                  />
                </div>
              )}

              {/* Timer */}
              <div className="flex items-center space-x-1 space-x-reverse font-mono text-slate-400 text-[11px]">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span dir="ltr">{formatDuration(recordingSeconds)}</span>
              </div>
            </div>

            {/* Live Streaming Word Flow */}
            <div
              className="flex-1 py-3 overflow-y-auto text-base leading-relaxed flex flex-wrap gap-x-1.5 gap-y-1 content-start"
              dir="rtl"
            >
              {committedWords.map((word, idx) => (
                <span key={`comm-${idx}-${word.start}`} className="text-slate-100">
                  {word.text}
                </span>
              ))}

              {trackedProvisionalWords.map((word) => {
                let cls = 'text-cyan-300';
                if (word.visualState === 'provisional-corrected') {
                  cls =
                    'text-amber-300 bg-amber-500/20 px-1 rounded border border-amber-400/40 animate-word-corrected font-semibold';
                } else if (word.visualState === 'provisional-new') {
                  cls = 'text-cyan-400 italic animate-word-appear';
                }
                return (
                  <span key={word.id} className={cls}>
                    {word.text}
                  </span>
                );
              })}

              <span className="inline-block w-1.5 h-4 bg-cyan-400 rounded-full animate-cursor-blink self-center mr-0.5" />
            </div>

            {/* Bottom hint */}
            <div className="text-[10px] text-slate-500 text-center pt-1 border-t border-slate-800/60 flex items-center justify-center space-x-1.5 space-x-reverse">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span>
                {settings.mode === 'pushToTalk'
                  ? t('releaseToStopHint')
                  : t('pressToStopHint')}
              </span>
            </div>
          </div>
        )}

        {/* State B: Result / Editor Mode */}
        {overlayState === 'result' && (
          <div className="flex flex-col h-full justify-between">
            {/* Header */}
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800/80">
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

            {/* Editable Text Result */}
            <textarea
              value={resultText}
              onChange={(e) => {
                setResultText(e.target.value);
                // Pause auto close if user edits
                if (autoCloseTimerRef.current) clearInterval(autoCloseTimerRef.current);
                setAutoCloseRemaining(null);
              }}
              className="flex-1 my-2 bg-navy-900/60 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-100 leading-relaxed resize-none focus:outline-none focus:border-cyan-500/50"
              dir="rtl"
              placeholder="متن تبدیل شده..."
            />

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <div className="flex items-center space-x-1.5 space-x-reverse">
                {/* Paste button */}
                <button
                  onClick={handlePaste}
                  className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-sm transition-all"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{pasted ? t('pasted') : t('pasteToApp')}</span>
                </button>

                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? t('copied') : t('copyText')}</span>
                </button>
              </div>

              {/* Open in studio */}
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

        {/* State C: Idle / Waiting Mode */}
        {overlayState === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-2">
              <Mic className="w-5 h-5 text-cyan-400" />
            </div>
            <p className="text-xs font-semibold text-slate-200">{t('quickDictationReady')}</p>
            <p className="text-[11px] text-slate-400 font-mono mt-1" dir="ltr">
              {settings.shortcut}
            </p>
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
