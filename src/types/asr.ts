export interface WordItem {
  text: string;
  start: number;
  end: number;
  join: boolean;
}

export type WordVisualState =
  | 'committed'
  | 'provisional-new'
  | 'provisional-corrected'
  | 'provisional-stable';

export interface TrackedWordItem extends WordItem {
  id: string;
  visualState: WordVisualState;
  lastRevisedAt?: number;
  createdAt: number;
}

export interface PartialEventPayload {
  sessionId: string;
  open: WordItem[];
  tail: WordItem[];
}

export interface CommitEventPayload {
  sessionId: string;
  words: WordItem[];
}

export interface LanguageEventPayload {
  sessionId: string;
  lang: string;
}

export interface EouEventPayload {
  sessionId: string;
  at: number;
  p: number;
}

export interface StatusEventPayload {
  sessionId?: string;
  status: 'idle' | 'recording' | 'processing' | 'paused' | 'error' | 'cancelled';
  message?: string;
}

export interface AudioLevelPayload {
  rms: number;
  peak: number;
  db: number;
  isSpeech: boolean;
}

export interface ModelInfo {
  isInstalled: boolean;
  isLoaded: boolean;
  asrFilename?: string;
  vadFilename?: string;
  asrSizeBytes: number;
  vadSizeBytes: number;
  version: number;
  languages: string[];
  parameterCountMillions: number;
  status: 'not_installed' | 'ready' | 'loaded' | 'error';
  errorMessage?: string;
}

export interface RecognitionSettings {
  languageMode: 'fa' | 'en' | 'fa,en';
  beamWidth: number;
  threads: number;
  autoThreads: boolean;
}

export interface QuickDictationSettings {
  enabled: boolean;
  shortcut: string;
  mode: 'pushToTalk' | 'toggle';
  autoPaste: boolean;
  timeoutSeconds: number;
  showWaveform: boolean;
}

export type PttState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'finalizing'
  | 'result'
  | 'cancelled'
  | 'error';

export interface AudioDeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
  channels: number;
  defaultSampleRate: number;
}

export interface TranscriptRecord {
  id: string;
  title: string;
  text: string;
  srtContent?: string;
  language: string;
  durationSecs: number;
  wordCount: number;
  createdAt: string;
}

export interface FileWaveformInfo {
  durationSecs: number;
  peaks: number[];
  sampleRate: number;
  channels: number;
}

export interface FileTranscribeProgressPayload {
  jobId: string;
  progress: number;
  currentSecs: number;
  totalSecs: number;
  newWords: WordItem[];
}

export interface FileTranscriptionResult {
  text: string;
  words: WordItem[];
  srtContent: string;
  durationSecs: number;
  language: string;
}

export interface AppStatus {
  name: string;
  version: string;
  isOffline: boolean;
  primaryLanguage: string;
  os: string;
}
