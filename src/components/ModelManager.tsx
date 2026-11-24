import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  Layers,
  FolderDown,
  Download,
  Globe,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import {
  InstalledModelEntry,
  ModelDownloadProgressPayload,
  ModelInfo,
  RemoteModelInfo,
} from '../types/asr';
import { useLanguage } from '../i18n/LanguageContext';

interface ModelManagerProps {
  modelInfo: ModelInfo | null;
  onRefresh: () => Promise<void>;
  onLoad: (threads?: number) => Promise<any>;
  onUnload: () => Promise<any>;
}

export const ModelManager: React.FC<ModelManagerProps> = ({
  modelInfo,
  onRefresh,
  onLoad,
  onUnload,
}) => {
  const { t, language } = useLanguage();
  const [asrPath, setAsrPath] = useState('');
  const [vadPath, setVadPath] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Installed & Remote GitHub models
  const [installedModels, setInstalledModels] = useState<InstalledModelEntry[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModelInfo[]>([]);
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgressPayload | null>(null);
  const [showRawMeta, setShowRawMeta] = useState(false);
  const [showManualImport, setShowManualImport] = useState(false);

  const loadInstalledList = async () => {
    try {
      const list = await invoke<InstalledModelEntry[]>('list_installed_models');
      setInstalledModels(list);
    } catch (err) {
      console.error('Failed to list installed models:', err);
    }
  };

  const loadRemoteList = async () => {
    setIsFetchingRemote(true);
    setRemoteError(null);
    try {
      const list = await invoke<RemoteModelInfo[]>('fetch_remote_models');
      setRemoteModels(list);
    } catch (err: any) {
      setRemoteError(String(err));
    } finally {
      setIsFetchingRemote(false);
    }
  };

  useEffect(() => {
    loadInstalledList();
    loadRemoteList();

    const unlistenPromise = listen<ModelDownloadProgressPayload>(
      'model://download-progress',
      (event) => {
        setDownloadProgress(event.payload);
      }
    );

    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  const handleSelectAsrFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'TinyASR Model', extensions: ['tzf', 'gz'] }],
      });
      if (selected && typeof selected === 'string') setAsrPath(selected);
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };

  const handleSelectVadFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Silero VAD Model', extensions: ['onnx', 'gz'] }],
      });
      if (selected && typeof selected === 'string') setVadPath(selected);
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };

  const handleImport = async () => {
    if (!asrPath || !vadPath) {
      setActionError(
        language === 'fa'
          ? 'لطفاً هر دو فایل مدل را انتخاب نمایید.'
          : 'Please select both ASR and Silero VAD model files.'
      );
      return;
    }

    setIsImporting(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await invoke('import_model_files', { asrPath, vadPath });
      await onRefresh();
      await loadInstalledList();
      setSuccessMessage(t('modelInstallSuccess'));
    } catch (err: any) {
      setActionError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleLoad = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await onLoad();
      await onRefresh();
      await loadInstalledList();
      setSuccessMessage(t('modelLoadSuccess'));
    } catch (err: any) {
      setActionError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnload = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await onUnload();
      await onRefresh();
      await loadInstalledList();
      setSuccessMessage(t('modelUnloadSuccess'));
    } catch (err: any) {
      setActionError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateModel = async (filename: string) => {
    setIsLoading(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await invoke('set_active_model', { filename });
      await onRefresh();
      await loadInstalledList();
      await loadRemoteList();
      setSuccessMessage(
        language === 'fa'
          ? `مدل ${filename} با موفقیت فعال و بارگذاری شد.`
          : `Model ${filename} activated and loaded.`
      );
    } catch (err: any) {
      setActionError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (filename: string) => {
    setActionError(null);
    try {
      await invoke('delete_installed_model', { filename });
      await loadInstalledList();
      await loadRemoteList();
    } catch (err: any) {
      setActionError(String(err));
    }
  };

  const handleDownloadRemote = async (model: RemoteModelInfo) => {
    setDownloadingFile(model.filename);
    setDownloadProgress({
      filename: model.filename,
      downloadedBytes: 0,
      totalBytes: model.sizeBytes,
      percent: 0,
      speedKbps: 0,
      status: 'downloading',
    });
    setActionError(null);
    setSuccessMessage(null);

    try {
      await invoke('download_and_install_model', {
        filename: model.filename,
        downloadUrl: model.downloadUrl,
        expectedSize: model.sizeBytes,
      });
      await loadInstalledList();
      await loadRemoteList();
      setSuccessMessage(
        language === 'fa'
          ? `مدل ${model.targetFilename} با موفقیت دانلود و نصب شد.`
          : `Model ${model.targetFilename} downloaded and installed.`
      );
    } catch (err: any) {
      if (!String(err).includes('cancelled')) {
        setActionError(String(err));
      }
    } finally {
      setDownloadingFile(null);
      setDownloadProgress(null);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await invoke('cancel_model_download');
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const asrSizeMb = modelInfo?.asrSizeBytes
    ? (modelInfo.asrSizeBytes / (1024 * 1024)).toFixed(1)
    : '0';
  const vadSizeMb = modelInfo?.vadSizeBytes
    ? (modelInfo.vadSizeBytes / (1024 * 1024)).toFixed(1)
    : '0';

  const meta = modelInfo?.metadata;

  return (
    <div className="w-full space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 space-x-reverse min-w-0">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
              {language === 'fa' ? 'مدیریت مدل‌های TinyASR' : 'TinyASR Model Manager'}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {language === 'fa'
                ? 'پشتیبانی چندزبانه Zipformer2 و Silero VAD v5'
                : 'Multi-language Zipformer2 & Silero VAD v5'}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            onRefresh();
            loadInstalledList();
          }}
          className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-400 hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
          title={t('refreshStatus')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Single-Line Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-navy-950/70 border border-slate-800 rounded-xl px-3 py-2.5 space-y-1">
          <span className="text-[11px] text-slate-400 block whitespace-nowrap">
            {language === 'fa' ? 'وضعیت' : 'Status'}
          </span>
          <div className="flex items-center space-x-1.5 space-x-reverse whitespace-nowrap">
            {modelInfo?.isInstalled ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-emerald-400">
                  {language === 'fa' ? 'نصب‌شده' : 'Installed'}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-amber-400">
                  {language === 'fa' ? 'نصب نشده' : 'Missing'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-navy-950/70 border border-slate-800 rounded-xl px-3 py-2.5 space-y-1">
          <span className="text-[11px] text-slate-400 block whitespace-nowrap">
            {language === 'fa' ? 'حافظه RAM' : 'RAM State'}
          </span>
          <div className="flex items-center space-x-1.5 space-x-reverse whitespace-nowrap">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                modelInfo?.isLoaded ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-600'
              }`}
            />
            <span className={`text-xs font-bold ${modelInfo?.isLoaded ? 'text-cyan-400' : 'text-slate-400'}`}>
              {modelInfo?.isLoaded
                ? language === 'fa'
                  ? 'آماده'
                  : 'Loaded'
                : language === 'fa'
                  ? 'تخلیه‌شده'
                  : 'Unloaded'}
            </span>
          </div>
        </div>

        <div className="bg-navy-950/70 border border-slate-800 rounded-xl px-3 py-2.5 space-y-1">
          <span className="text-[11px] text-slate-400 block whitespace-nowrap">
            {language === 'fa' ? 'زبان‌های فعال' : 'Languages'}
          </span>
          <div className="flex items-center gap-1 whitespace-nowrap overflow-hidden">
            {(modelInfo?.languages || ['fa', 'en']).slice(0, 3).map((lang) => (
              <span
                key={lang}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
              >
                {lang.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-navy-950/70 border border-slate-800 rounded-xl px-3 py-2.5 space-y-1">
          <span className="text-[11px] text-slate-400 block whitespace-nowrap">
            {language === 'fa' ? 'حجم مدل' : 'Model Size'}
          </span>
          <span className="text-xs font-mono text-slate-200 block whitespace-nowrap" dir="ltr">
            {asrSizeMb} / {vadSizeMb} MB
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!modelInfo?.isLoaded ? (
          <button
            onClick={handleLoad}
            disabled={!modelInfo?.isInstalled || isLoading}
            className="flex items-center space-x-1.5 space-x-reverse px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {isLoading
                ? language === 'fa'
                  ? 'در حال بارگذاری...'
                  : 'Loading...'
                : language === 'fa'
                  ? 'بارگذاری مدل در RAM'
                  : 'Load Model to RAM'}
            </span>
          </button>
        ) : (
          <button
            onClick={handleUnload}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
          >
            {language === 'fa' ? 'تخلیه مدل از RAM' : 'Unload from RAM'}
          </button>
        )}
      </div>

      {/* Alerts */}
      {actionError && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 space-x-reverse">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="break-all">{actionError}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 space-x-reverse">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ================= BINARY MODEL METADATA INSPECTOR ================= */}
      <div className="bg-navy-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 space-x-reverse text-xs font-bold text-slate-200">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              {language === 'fa'
                ? 'متادیتای باینری مدل فعال'
                : 'Active AI Model Binary Metadata'}
            </span>
          </div>
          {meta && (
            <button
              onClick={() => setShowRawMeta(!showRawMeta)}
              className="flex items-center space-x-1 space-x-reverse text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              <span>{language === 'fa' ? 'پارامترهای داخلی' : 'Raw Hyperparams'}</span>
              {showRawMeta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {meta ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                <span className="text-slate-400 block">
                  {language === 'fa' ? 'فرمت / کوانتیزاسیون' : 'Format / Quant'}
                </span>
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {meta.formatVersion} · int4 ({meta.int4Tensors}t)
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                <span className="text-slate-400 block">
                  {language === 'fa' ? 'تعداد پارامترها' : 'Parameters'}
                </span>
                <span className="font-mono text-emerald-300 font-semibold" dir="ltr">
                  {(meta.totalParameters / 1_000_000).toFixed(2)}M ({meta.tensorCount} tensors)
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                <span className="text-slate-400 block">
                  {language === 'fa' ? 'واژگان (Vocab)' : 'Vocabulary'}
                </span>
                <span className="font-mono text-amber-300 font-semibold" dir="ltr">
                  {meta.vocabSize.toLocaleString()} BPE tokens
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                <span className="text-slate-400 block">
                  {language === 'fa' ? 'لایه‌های انکودر' : 'Encoder Stacks'}
                </span>
                <span className="font-mono text-slate-200 font-semibold" dir="ltr">
                  {meta.nStacks ?? '-'} stacks · pos {meta.posDim ?? '-'}
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                <span className="text-slate-400 block">
                  {language === 'fa' ? 'پنجره استریم' : 'Stream Chunk'}
                </span>
                <span className="font-mono text-slate-200 font-semibold" dir="ltr">
                  {meta.chunkFrames ?? '-'} frames ({meta.chunkMs ?? '-'} ms)
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                <span className="text-slate-400 block">
                  {language === 'fa' ? 'نرخ نمونه‌برداری / گروه' : 'Sample Rate / Group'}
                </span>
                <span className="font-mono text-slate-200 font-semibold" dir="ltr">
                  {meta.sampleRate} Hz · g{meta.quantGroupSize ?? '-'}
                </span>
              </div>
            </div>

            {showRawMeta && (
              <div className="bg-[#111215] border border-white/[0.06] rounded-lg p-3 space-y-2 text-[11px] font-mono max-h-44 overflow-y-auto" dir="ltr">
                <div className="text-slate-400 font-semibold">Hyperparameters (cfg):</div>
                <div className="flex flex-wrap gap-1.5">
                  {meta.hyperparameters.map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                      {k}={v}
                    </span>
                  ))}
                </div>
                {meta.textRules.length > 0 && (
                  <>
                    <div className="text-slate-400 font-semibold pt-1">Embedded Text & Language Rules:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {meta.textRules.map(([k, v]) => (
                        <span key={k} className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {k}: "{v}"
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500">
            {language === 'fa'
              ? 'متادیتایی یافت نشد. مدل را نصب یا بارگذاری کنید.'
              : 'No binary metadata available yet.'}
          </p>
        )}
      </div>

      {/* ================= INSTALLED MODELS SWITCHER ================= */}
      {installedModels.length > 0 && (
        <div className="bg-navy-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center space-x-2 space-x-reverse text-xs font-bold text-slate-200">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span>
              {language === 'fa' ? 'مدل‌های نصب‌شده روی سیستم' : 'Installed Local Models'}
            </span>
          </div>

          <div className="space-y-2">
            {installedModels.map((item) => (
              <div
                key={item.filename}
                className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border text-xs ${
                  item.isActive
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-white/[0.02] border-white/[0.06]'
                }`}
              >
                <div className="flex items-center space-x-2 space-x-reverse min-w-0">
                  <span className="font-mono font-semibold text-white" dir="ltr">
                    {item.filename}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400" dir="ltr">
                    {(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                  </span>
                  <div className="flex gap-1">
                    {item.languages.map((l) => (
                      <span
                        key={l}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-cyan-300"
                      >
                        {l.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse shrink-0">
                  {item.isActive ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                      {language === 'fa' ? 'فعال' : 'Active'}
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleActivateModel(item.filename)}
                        disabled={isLoading}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        {language === 'fa' ? 'فعال‌سازی' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteModel(item.filename)}
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                        title={language === 'fa' ? 'حذف مدل' : 'Delete model'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= GITHUB MODELS MARKETPLACE & PRO DOWNLOADER ================= */}
      <div className="bg-navy-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 space-x-reverse text-xs font-bold text-slate-200">
            <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              {language === 'fa'
                ? 'دانلود مدل زبان‌های دیگر (از مخزن گیت‌هاب)'
                : 'Language Model Hub (GitHub Models)'}
            </span>
          </div>
          <button
            onClick={loadRemoteList}
            disabled={isFetchingRemote}
            className="flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-[11px] text-slate-300 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 text-cyan-400 ${isFetchingRemote ? 'animate-spin' : ''}`} />
            <span>{language === 'fa' ? 'بروزرسانی لیست' : 'Refresh'}</span>
          </button>
        </div>

        {/* Live Download Progress Bar */}
        {downloadProgress && downloadingFile && (
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                {downloadProgress.filename} ({downloadProgress.status})
              </span>
              <div className="flex items-center space-x-2 space-x-reverse font-mono text-[11px] text-slate-300" dir="ltr">
                <span>
                  {(downloadProgress.downloadedBytes / (1024 * 1024)).toFixed(1)} /{' '}
                  {(downloadProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
                {downloadProgress.speedKbps > 0 && (
                  <span className="text-emerald-400">{Math.round(downloadProgress.speedKbps)} KB/s</span>
                )}
                <span className="text-cyan-400 font-bold">{Math.round(downloadProgress.percent)}%</span>
                <button
                  onClick={handleCancelDownload}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 cursor-pointer"
                  title="Cancel Download"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-150"
                style={{ width: `${Math.min(100, Math.round(downloadProgress.percent))}%` }}
              />
            </div>
          </div>
        )}

        {remoteError && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
            {language === 'fa'
              ? `عدم دسترسی به مخزن آنلاین مدل‌ها: ${remoteError}`
              : `Could not load remote models: ${remoteError}`}
          </p>
        )}

        {isFetchingRemote && remoteModels.length === 0 ? (
          <div className="text-xs text-slate-400 py-3 text-center animate-pulse">
            {language === 'fa' ? 'در حال دریافت لیست مدل‌ها از گیت‌هاب...' : 'Fetching models from GitHub...'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {remoteModels.map((rm) => {
              const isThisDownloading = downloadingFile === rm.filename;
              const sizeMb = (rm.sizeBytes / (1024 * 1024)).toFixed(1);
              return (
                <div
                  key={rm.filename}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {language === 'fa' ? rm.displayNameFa : rm.displayNameEn}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400" dir="ltr">
                      <span>{rm.targetFilename}</span>
                      <span>•</span>
                      <span>{sizeMb} MB</span>
                    </div>
                  </div>

                  {rm.isInstalled ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[10px] font-bold shrink-0">
                      {language === 'fa' ? 'نصب‌شده' : 'Installed'}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDownloadRemote(rm)}
                      disabled={!!downloadingFile}
                      className="flex items-center space-x-1 space-x-reverse px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold shrink-0 cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3 h-3" />
                      <span>
                        {isThisDownloading
                          ? language === 'fa'
                            ? 'در حال دانلود'
                            : 'Downloading'
                          : language === 'fa'
                            ? 'دانلود'
                            : 'Download'}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible Manual File Import (for offline custom files) */}
      <div className="border-t border-slate-800/80 pt-3">
        <button
          onClick={() => setShowManualImport(!showManualImport)}
          className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <span className="flex items-center space-x-1.5 space-x-reverse">
            <FolderDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>{language === 'fa' ? 'نصب دستی از فایل محلی' : 'Manual Local Model Import'}</span>
          </span>
          {showManualImport ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showManualImport && (
          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex space-x-2 space-x-reverse">
                <input
                  type="text"
                  readOnly
                  value={asrPath}
                  placeholder="en-fa.tzf / .tzf.gz"
                  className="flex-1 bg-navy-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 font-mono min-w-0"
                  dir="ltr"
                />
                <button
                  onClick={handleSelectAsrFile}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 shrink-0 cursor-pointer"
                >
                  {language === 'fa' ? 'انتخاب' : 'Browse'}
                </button>
              </div>
              <div className="flex space-x-2 space-x-reverse">
                <input
                  type="text"
                  readOnly
                  value={vadPath}
                  placeholder="silero_vad.onnx / .gz"
                  className="flex-1 bg-navy-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 font-mono min-w-0"
                  dir="ltr"
                />
                <button
                  onClick={handleSelectVadFile}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 shrink-0 cursor-pointer"
                >
                  {language === 'fa' ? 'انتخاب' : 'Browse'}
                </button>
              </div>
            </div>
            <button
              onClick={handleImport}
              disabled={isImporting || !asrPath || !vadPath}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs disabled:opacity-40 cursor-pointer"
            >
              {isImporting
                ? language === 'fa'
                  ? 'در حال بررسی...'
                  : 'Validating...'
                : language === 'fa'
                  ? 'بررسی و نصب'
                  : 'Verify & Install'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
