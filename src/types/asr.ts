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

export interface ModelMetadata {
  formatVersion: string;
  tensorCount: number;
  totalParameters: number;
  int4Tensors: number;
  int8Tensors: number;
  fp32Tensors: number;
  quantGroupSize?: number | null;
  vocabSize: number;
  nStacks?: number | null;
  posDim?: number | null;
  chunkFrames?: number | null;
  chunkMs?: number | null;
  sampleRate: number;
  hyperparameters: [string, number][];
  textRules: [string, string][];
}

export interface InstalledModelEntry {
  filename: string;
  sizeBytes: number;
  isActive: boolean;
  isLoaded: boolean;
  languages: string[];
  metadata?: ModelMetadata | null;
}

export interface RemoteModelInfo {
  filename: string;
  targetFilename: string;
  displayNameFa: string;
  displayNameEn: string;
  languages: string[];
  sizeBytes: number;
  downloadUrl: string;
  isInstalled: boolean;
  isActive: boolean;
}

export interface ModelDownloadProgressPayload {
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedKbps: number;
  status: 'downloading' | 'verifying' | 'done' | 'cancelled' | 'error';
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
  metadata?: ModelMetadata | null;
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

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseNotes: string;
  htmlUrl: string;
  assetName: string;
  assetPath: string;
  assetSize: number;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  updateInfo?: UpdateInfo | null;
  currentVersion: string;
  latestVersion?: string | null;
  offlineOrSkipped: boolean;
}

export type VoiceActivationMode = 'wake_only';

export type VoiceActivationState =
  | 'disabled'
  | 'starting'
  | 'listening'
  | 'triggered'
  | 'paused_for_recording'
  | 'stopping'
  | 'error';

export interface VoiceActivationSettings {
  enabled: boolean;
  wakePhrase: string;
  mode: VoiceActivationMode;
}

export interface VoiceActivationStatusPayload {
  enabled: boolean;
  state: VoiceActivationState;
  wakePhrase: string;
  mode: VoiceActivationMode;
  errorMessage?: string | null;
  modelReady: boolean;
}
