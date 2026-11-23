import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AudioLevelPayload,
  CommitEventPayload,
  EouEventPayload,
  LanguageEventPayload,
  ModelInfo,
  PartialEventPayload,
  RecognitionSettings,
  StatusEventPayload,
  TrackedWordItem,
  WordItem,
} from '../types/asr';
import { trackProvisionalWords, pruneExpiredVisualStates } from '../utils/wordDiffTracker';

export function useAsr() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [settings, setSettings] = useState<RecognitionSettings>({
    languageMode: 'fa',
    beamWidth: 4,
    threads: 4,
    autoThreads: true,
  });
  const [status, setStatus] = useState<
    'idle' | 'recording' | 'processing' | 'paused' | 'error' | 'cancelled'
  >('idle');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<string>('fa');
  const [eouProb, setEouProb] = useState<number | null>(null);
  const [listenersReady, setListenersReady] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<AudioLevelPayload>({
    rms: 0,
    peak: 0,
    db: -96,
    isSpeech: false,
  });

  // Transcript state:
  // Finalized words that never change
  const [committedWords, setCommittedWords] = useState<WordItem[]>([]);
  // Open words from full-context re-decoding
  const [openWords, setOpenWords] = useState<WordItem[]>([]);
  // Tail words from streaming decoder
  const [tailWords, setTailWords] = useState<WordItem[]>([]);
  // Telegram-style tracked provisional words with revision diff detection
  const [trackedProvisionalWords, setTrackedProvisionalWords] = useState<TrackedWordItem[]>([]);

  const currentSessionIdRef = useRef<string | null>(null);
  const committedWordsRef = useRef<WordItem[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  // Keep committedWordsRef in sync
  useEffect(() => {
    committedWordsRef.current = committedWords;
  }, [committedWords]);

  // Refresh model status
  const refreshModelStatus = useCallback(async () => {
    try {
      const info = await invoke<ModelInfo>('get_model_status');
      setModelInfo(info);
    } catch (err) {
      console.error('Failed to get model status:', err);
    }
  }, []);

  // Refresh settings
  const refreshSettings = useCallback(async () => {
    try {
      const s = await invoke<RecognitionSettings>('get_recognition_settings');
      setSettings(s);
    } catch (err) {
      console.error('Failed to get recognition settings:', err);
    }
  }, []);

  useEffect(() => {
    refreshModelStatus();
    refreshSettings();
  }, [refreshModelStatus, refreshSettings]);

  // Duration timer during recording
  useEffect(() => {
    let interval: number | undefined;
    if (status === 'recording') {
      if (!recordingStartTimeRef.current) {
        recordingStartTimeRef.current = Date.now();
      }
      interval = window.setInterval(() => {
        if (recordingStartTimeRef.current) {
          setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        }
      }, 500);
    } else {
      recordingStartTimeRef.current = null;
    }
    return () => clearInterval(interval);
  }, [status]);

  // Animation expiration ticker
  useEffect(() => {
    if (status !== 'recording' && trackedProvisionalWords.length === 0) return;
    const ticker = setInterval(() => {
      setTrackedProvisionalWords((prev) => pruneExpiredVisualStates(prev));
    }, 150);
    return () => clearInterval(ticker);
  }, [status, trackedProvisionalWords.length]);

  // Setup Tauri event listeners with bulletproof readiness handshake
  useEffect(() => {
    let isCancelled = false;
    const cleanups: Array<() => void> = [];

    async function setupListeners() {
      // 1. Partial: replace previous uncommitted open & tail words with instantaneous streaming
      const uPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        if (isCancelled) return;
        if (event.payload.sessionId) {
          currentSessionIdRef.current = event.payload.sessionId;
          setCurrentSessionId(event.payload.sessionId);
        }

        const open = event.payload.open || [];
        const tail = event.payload.tail || [];
        setOpenWords(open);
        setTailWords(tail);

        setTrackedProvisionalWords((prev) =>
          trackProvisionalWords(prev, open, tail, committedWordsRef.current)
        );
      });
      cleanups.push(uPartial);

      // 2. Commit: append finalized words to committedWords with timestamp-aware deduplication
      const uCommit = await listen<CommitEventPayload>('asr://commit', (event) => {
        if (isCancelled) return;
        if (event.payload.sessionId) {
          currentSessionIdRef.current = event.payload.sessionId;
          setCurrentSessionId(event.payload.sessionId);
        }

        if (event.payload.words && event.payload.words.length > 0) {
          setCommittedWords((prev) => {
            const merged = mergeCommittedWords(prev, event.payload.words);
            committedWordsRef.current = merged;
            return merged;
          });
          setOpenWords([]);
          setTailWords([]);
          setTrackedProvisionalWords([]);
        }
      });
      cleanups.push(uCommit);

      // 3. Language switched
      const uLang = await listen<LanguageEventPayload>('asr://language', (event) => {
        if (isCancelled) return;
        setActiveLanguage(event.payload.lang);
      });
      cleanups.push(uLang);

      // 4. End-of-turn head output
      const uEou = await listen<EouEventPayload>('asr://eou', (event) => {
        if (isCancelled) return;
        setEouProb(event.payload.p);
      });
      cleanups.push(uEou);

      // 5. Engine status
      const uStatus = await listen<StatusEventPayload>('asr://status', (event) => {
        if (isCancelled) return;
        if (event.payload.sessionId) {
          currentSessionIdRef.current = event.payload.sessionId;
          setCurrentSessionId(event.payload.sessionId);
        }
        setStatus(event.payload.status as any);
      });
      cleanups.push(uStatus);

      // 6. Audio level visualization
      const uLevel = await listen<AudioLevelPayload>('audio://level', (event) => {
        if (isCancelled) return;
        setAudioLevel(event.payload);
      });
      cleanups.push(uLevel);

      if (!isCancelled) {
        setListenersReady(true);
        logListenersReady();
      }
    }

    setupListeners();

    return () => {
      isCancelled = true;
      setListenersReady(false);
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore cleanup errors on shutdown
        }
      });
    };
  }, []);

  const startRecording = async (customSessionId?: string) => {
    try {
      setCommittedWords([]);
      committedWordsRef.current = [];
      setOpenWords([]);
      setTailWords([]);
      setTrackedProvisionalWords([]);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();

      // Pre-assign session ID to prevent event race conditions
      const newSessionId = customSessionId || crypto.randomUUID();
      currentSessionIdRef.current = newSessionId;
      setCurrentSessionId(newSessionId);
      setStatus('recording');

      const confirmedSessionId = await invoke<string>('start_recording', {
        clientSessionId: newSessionId,
      });

      if (confirmedSessionId !== newSessionId) {
        currentSessionIdRef.current = confirmedSessionId;
        setCurrentSessionId(confirmedSessionId);
      }

      return confirmedSessionId;
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setStatus('error');
      currentSessionIdRef.current = null;
      setCurrentSessionId(null);
      throw err;
    }
  };

  const stopRecording = async () => {
    try {
      setStatus('processing');
      await invoke('stop_recording');
      setStatus('idle');
      setOpenWords([]);
      setTailWords([]);
      setTrackedProvisionalWords([]);
    } catch (err: any) {
      console.error('Failed to stop recording:', err);
      setStatus('error');
      throw err;
    }
  };

  const cancelRecording = async () => {
    try {
      await invoke('cancel_recording');
      setStatus('idle');
      setOpenWords([]);
      setTailWords([]);
      setTrackedProvisionalWords([]);
      currentSessionIdRef.current = null;
      setCurrentSessionId(null);
    } catch (err) {
      console.error('Failed to cancel recording:', err);
    }
  };

  const clearTranscript = () => {
    setCommittedWords([]);
    committedWordsRef.current = [];
    setOpenWords([]);
    setTailWords([]);
    setTrackedProvisionalWords([]);
    setRecordingDuration(0);
    setEouProb(null);
  };

  const loadModels = async (threads?: number) => {
    const updated = await invoke<ModelInfo>('load_asr_models', { threads });
    setModelInfo(updated);
    return updated;
  };

  const unloadModels = async () => {
    const updated = await invoke<ModelInfo>('unload_asr_models');
    setModelInfo(updated);
    return updated;
  };

  const updateSettings = async (newSettings: RecognitionSettings) => {
    const updated = await invoke<RecognitionSettings>('update_recognition_settings', {
      settings: newSettings,
    });
    setSettings(updated);
    return updated;
  };

  // Combine all current words for full plain text export
  const allCurrentWords: WordItem[] = [
    ...committedWords,
    ...(trackedProvisionalWords.length > 0
      ? trackedProvisionalWords.map((tw) => ({
          text: tw.text,
          start: tw.start,
          end: tw.end,
          join: tw.join,
        }))
      : [...openWords, ...tailWords]),
  ];

  return {
    modelInfo,
    settings,
    status,
    currentSessionId,
    activeLanguage,
    eouProb,
    audioLevel,
    committedWords,
    openWords,
    tailWords,
    trackedProvisionalWords,
    allCurrentWords,
    recordingDuration,
    listenersReady,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
    loadModels,
    unloadModels,
    refreshModelStatus,
    updateSettings,
    refreshSettings,
  };
}

function logListenersReady() {
  console.log('[VoxaLocal ASR] IPC event listeners registered and ready for streaming.');
}

/**
 * Merges newly committed words into the existing committed transcript,
 * ensuring no duplicate words or repeated sentences are appended.
 */
function mergeCommittedWords(existing: WordItem[], incoming: WordItem[]): WordItem[] {
  if (!incoming || incoming.length === 0) return existing;
  if (!existing || existing.length === 0) return incoming;

  // Check if incoming is an exact duplicate of the tail of existing words
  const incomingTexts = incoming.map((w) => w.text.trim()).join(' ');
  const existingTexts = existing.map((w) => w.text.trim()).join(' ');

  if (existingTexts.endsWith(incomingTexts)) {
    const lastExisting = existing[existing.length - 1];
    const lastIncoming = incoming[incoming.length - 1];
    if (Math.abs(lastExisting.end - lastIncoming.end) < 0.25) {
      return existing;
    }
  }

  // Filter individual incoming words that already exist in the committed transcript
  const filteredIncoming = incoming.filter((newWord) => {
    return !existing.some((existingWord) => {
      // 1. Same timestamps within small jitter tolerance
      const isSameTime =
        Math.abs(existingWord.start - newWord.start) < 0.12 &&
        Math.abs(existingWord.end - newWord.end) < 0.12;

      // 2. Same text within the same time window
      const isSameTextAndApproxTime =
        existingWord.text.trim() === newWord.text.trim() &&
        Math.abs(existingWord.start - newWord.start) < 0.35;

      return isSameTime || isSameTextAndApproxTime;
    });
  });

  if (filteredIncoming.length === 0) {
    return existing;
  }

  return [...existing, ...filteredIncoming];
}
