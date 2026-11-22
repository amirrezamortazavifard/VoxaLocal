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

  // Setup Tauri event listeners
  useEffect(() => {
    let unlistenPartial: (() => void) | undefined;
    let unlistenCommit: (() => void) | undefined;
    let unlistenLang: (() => void) | undefined;
    let unlistenEou: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenAudioLevel: (() => void) | undefined;

    async function setupListeners() {
      // 1. Partial: replace previous uncommitted open & tail words
      unlistenPartial = await listen<PartialEventPayload>('asr://partial', (event) => {
        setOpenWords(event.payload.open || []);
        setTailWords(event.payload.tail || []);
      });

      // 2. Commit: append finalized words to committedWords, clear uncommitted
      unlistenCommit = await listen<CommitEventPayload>('asr://commit', (event) => {
        if (event.payload.words && event.payload.words.length > 0) {
          setCommittedWords((prev) => [...prev, ...event.payload.words]);
          setOpenWords([]);
          setTailWords([]);
        }
      });

      // 3. Language switched
      unlistenLang = await listen<LanguageEventPayload>('asr://language', (event) => {
        setActiveLanguage(event.payload.lang);
      });

      // 4. End-of-turn head output
      unlistenEou = await listen<EouEventPayload>('asr://eou', (event) => {
        setEouProb(event.payload.p);
      });

      // 5. Engine status
      unlistenStatus = await listen<StatusEventPayload>('asr://status', (event) => {
        setStatus(event.payload.status as any);
      });

      // 6. Audio level visualization
      unlistenAudioLevel = await listen<AudioLevelPayload>('audio://level', (event) => {
        setAudioLevel(event.payload);
      });
    }

    setupListeners();

    return () => {
      unlistenPartial?.();
      unlistenCommit?.();
      unlistenLang?.();
      unlistenEou?.();
      unlistenStatus?.();
      unlistenAudioLevel?.();
    };
  }, []);

  const startRecording = async () => {
    try {
      setOpenWords([]);
      setTailWords([]);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();
      const sessionId = await invoke<string>('start_recording');
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

  // Combine all current words for full text preview
  const allCurrentWords = [...committedWords, ...openWords, ...tailWords];

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
