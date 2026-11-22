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
  WordItem,
} from '../types/asr';

export function useAsr() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [settings, setSettings] = useState<RecognitionSettings>({
    languageMode: 'fa',
    beamWidth: 4,
    threads: 4,
    autoThreads: true,
  });
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'paused' | 'error' | 'cancelled'>('idle');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<string>('fa');
  const [eouProb, setEouProb] = useState<number | null>(null);
  const [audioLevel, setAudioLevel] = useState<AudioLevelPayload>({
    rms: 0,
    peak: 0,
    db: -96,
    isSpeech: false,
  });

  // Transcript state:
  // committedWords: Finalized words that never change
  const [committedWords, setCommittedWords] = useState<WordItem[]>([]);
  // openWords: Words produced by full-context re-decoding (Partial.open)
  const [openWords, setOpenWords] = useState<WordItem[]>([]);
  // tailWords: Streaming pass words (Partial.tail)
  const [tailWords, setTailWords] = useState<WordItem[]>([]);

  const currentSessionIdRef = useRef<string | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

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

  // Setup Tauri event listeners with bulletproof lifecycle cleanup
  useEffect(() => {
    let isCancelled = false;
    const cleanups: Array<() => void> = [];

    async function setupListeners() {
      // 1. Partial: replace previous uncommitted open & tail words
      const uPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        if (isCancelled) return;
        if (currentSessionIdRef.current && event.payload.sessionId !== currentSessionIdRef.current) {
          return;
        }
        setOpenWords(event.payload.open || []);
        setTailWords(event.payload.tail || []);
      });
      if (isCancelled) {
        uPartial();
      } else {
        cleanups.push(uPartial);
      }

      // 2. Commit: append finalized words to committedWords with timestamp-aware deduplication
      const uCommit = await listen<CommitEventPayload>('asr://commit', (event) => {
        if (isCancelled) return;
        if (currentSessionIdRef.current && event.payload.sessionId !== currentSessionIdRef.current) {
          return;
        }
        if (event.payload.words && event.payload.words.length > 0) {
          setCommittedWords((prev) => mergeCommittedWords(prev, event.payload.words));
          setOpenWords([]);
          setTailWords([]);
        }
      });
      if (isCancelled) {
        uCommit();
      } else {
        cleanups.push(uCommit);
      }

      // 3. Language switched
      const uLang = await listen<LanguageEventPayload>('asr://language', (event) => {
        if (isCancelled) return;
        if (currentSessionIdRef.current && event.payload.sessionId !== currentSessionIdRef.current) {
          return;
        }
        setActiveLanguage(event.payload.lang);
      });
      if (isCancelled) {
        uLang();
      } else {
        cleanups.push(uLang);
      }

      // 4. End-of-turn head output
      const uEou = await listen<EouEventPayload>('asr://eou', (event) => {
        if (isCancelled) return;
        if (currentSessionIdRef.current && event.payload.sessionId !== currentSessionIdRef.current) {
          return;
        }
        setEouProb(event.payload.p);
      });
      if (isCancelled) {
        uEou();
      } else {
        cleanups.push(uEou);
      }

      // 5. Engine status
      const uStatus = await listen<StatusEventPayload>('asr://status', (event) => {
        if (isCancelled) return;
        if (event.payload.sessionId && currentSessionIdRef.current && event.payload.sessionId !== currentSessionIdRef.current) {
          return;
        }
        setStatus(event.payload.status as any);
      });
      if (isCancelled) {
        uStatus();
      } else {
        cleanups.push(uStatus);
      }

      // 6. Audio level visualization
      const uLevel = await listen<AudioLevelPayload>('audio://level', (event) => {
        if (isCancelled) return;
        setAudioLevel(event.payload);
      });
      if (isCancelled) {
        uLevel();
      } else {
        cleanups.push(uLevel);
      }
    }

    setupListeners();

    return () => {
      isCancelled = true;
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore cleanup errors on shutdown
        }
      });
    };
  }, []);

  const startRecording = async () => {
    try {
      setCommittedWords([]);
      setOpenWords([]);
      setTailWords([]);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();
      const sessionId = await invoke<string>('start_recording');
      currentSessionIdRef.current = sessionId;
      setCurrentSessionId(sessionId);
      setStatus('recording');
      return sessionId;
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setStatus('error');
      throw err;
    }
  };

  const stopRecording = async () => {
    try {
      setStatus('processing');
      await invoke('stop_recording');
      setStatus('idle');
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
    } catch (err) {
      console.error('Failed to cancel recording:', err);
    }
  };

  const clearTranscript = () => {
    setCommittedWords([]);
    setOpenWords([]);
    setTailWords([]);
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

  // Filter uncommitted words that may duplicate or overlap with already committed words
  const cleanOpenWords = filterUncommittedWords(openWords, committedWords);
  const cleanTailWords = filterUncommittedWords(tailWords, committedWords, cleanOpenWords);

  // Combine all current words for full text preview without duplicates
  const allCurrentWords = [...committedWords, ...cleanOpenWords, ...cleanTailWords];

  return {
    modelInfo,
    settings,
    status,
    currentSessionId,
    activeLanguage,
    eouProb,
    audioLevel,
    committedWords,
    openWords: cleanOpenWords,
    tailWords: cleanTailWords,
    allCurrentWords,
    recordingDuration,
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

/**
 * Filters out uncommitted open/tail words that overlap in time or match text
 * of words that have already been finalized.
 */
function filterUncommittedWords(
  words: WordItem[],
  committed: WordItem[],
  existingPrefix: WordItem[] = []
): WordItem[] {
  if (!words || words.length === 0) return [];
  if (committed.length === 0 && existingPrefix.length === 0) return words;

  const lastCommittedEnd = committed.length > 0 ? committed[committed.length - 1].end : -1;

  return words.filter((w) => {
    // Drop if before last committed end timestamp
    if (w.start < lastCommittedEnd - 0.05) {
      return false;
    }

    // Drop if already in committed words
    const inCommitted = committed.some(
      (cw) =>
        (Math.abs(cw.start - w.start) < 0.12 && Math.abs(cw.end - w.end) < 0.12) ||
        (cw.text.trim() === w.text.trim() && Math.abs(cw.start - w.start) < 0.35)
    );
    if (inCommitted) return false;

    // Drop if already in prefix words
    const inPrefix = existingPrefix.some(
      (pw) =>
        (Math.abs(pw.start - w.start) < 0.12 && Math.abs(pw.end - w.end) < 0.12) ||
        (pw.text.trim() === w.text.trim() && Math.abs(pw.start - w.start) < 0.35)
    );
    return !inPrefix;
  });
}
