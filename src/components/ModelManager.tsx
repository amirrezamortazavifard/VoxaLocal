import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Cpu, CheckCircle2, AlertTriangle, HardDrive, RefreshCw, Layers, FolderDown } from 'lucide-react';
import { ModelInfo } from '../types/asr';
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
  const { t } = useLanguage();
  const [asrPath, setAsrPath] = useState('');
  const [vadPath, setVadPath] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSelectAsrFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'TinyASR Model', extensions: ['tzf', 'gz'] }],
      });
      if (selected && typeof selected === 'string') {
        setAsrPath(selected);
      }
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
      if (selected && typeof selected === 'string') {
        setVadPath(selected);
      }
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };

  const handleImport = async () => {
    if (!asrPath || !vadPath) {
      setActionError('Please select both ASR and Silero VAD model files / لطفاً هر دو فایل مدل را انتخاب نمایید.');
      return;
    }

    setIsImporting(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await invoke('import_model_files', {
        asrPath,
        vadPath,
      });
      await onRefresh();
      setSuccessMessage(t('modelInstallSuccess'));
    } catch (err: any) {
      setActionError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportBundled = async () => {
    setIsImporting(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const bundledAsr = '../vendor/tinyasr/models/en-fa.tzf.gz';
      const bundledVad = '../vendor/tinyasr/models/silero_vad.onnx.gz';

      await invoke('import_model_files', {
        asrPath: bundledAsr,
        vadPath: bundledVad,
      });
      await onRefresh();
      setSuccessMessage(t('modelInstallSuccess'));
    } catch (err: any) {
      setActionError(`Error importing bundled models: ${String(err)}`);
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
      setSuccessMessage(t('modelUnloadSuccess'));
    } catch (err: any) {
      setActionError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const asrSizeMb = modelInfo?.asrSizeBytes
    ? (modelInfo.asrSizeBytes / (1024 * 1024)).toFixed(1)
    : '0';
  const vadSizeMb = modelInfo?.vadSizeBytes
    ? (modelInfo.vadSizeBytes / (1024 * 1024)).toFixed(1)
    : '0';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title Card */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">{t('modelManagerTitle')}</h2>
              <p className="text-xs text-slate-400">
                {t('modelManagerSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 transition-colors"
            title={t('refreshStatus')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Current Status Box */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl shadow-inner">
            <span className="text-[11px] text-slate-400 block mb-1">{t('installStatus')}</span>
            <div className="flex items-center space-x-2 space-x-reverse">
              {modelInfo?.isInstalled ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-300">{t('installed')}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-amber-300">{t('notInstalled')}</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl shadow-inner">
            <span className="text-[11px] text-slate-400 block mb-1">{t('ramStatus')}</span>
            <div className="flex items-center space-x-2 space-x-reverse">
              {modelInfo?.isLoaded ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>
                  <span className="text-xs font-semibold text-cyan-300">{t('loadedInRam')}</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600 shrink-0"></span>
                  <span className="text-xs font-semibold text-slate-400">{t('unloadedFromRam')}</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl shadow-inner">
            <span className="text-[11px] text-slate-400 block mb-1">{t('modelLanguages')}</span>
            <div className="flex items-center space-x-1.5 space-x-reverse" dir="ltr">
              {modelInfo?.languages?.map((lang) => (
                <span
                  key={lang}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                >
                  {lang.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl shadow-inner">
            <span className="text-[11px] text-slate-400 block mb-1">{t('modelSizes')}</span>
            <span className="text-xs font-mono text-slate-200" dir="ltr">
              {asrSizeMb} MiB / {vadSizeMb} MiB
            </span>
          </div>
        </div>

        {/* Load / Unload Controls */}
        <div className="flex items-center space-x-3 space-x-reverse mt-6 pt-4 border-t border-slate-800/80">
          {modelInfo?.isInstalled && !modelInfo?.isLoaded && (
            <button
              onClick={handleLoad}
              disabled={isLoading}
              className="flex items-center space-x-2 space-x-reverse px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all"
            >
              <Cpu className="w-4 h-4" />
              <span>{isLoading ? t('loadingModel') : t('loadModelBtn')}</span>
            </button>
          )}

          {modelInfo?.isLoaded && (
            <button
              onClick={handleUnload}
              disabled={isLoading}
              className="flex items-center space-x-2 space-x-reverse px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 disabled:opacity-50 transition-all"
            >
              <span>{isLoading ? t('unloadingModel') : t('unloadModelBtn')}</span>
            </button>
          )}

          <button
            onClick={handleImportBundled}
            disabled={isImporting}
            className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-navy-950 hover:bg-slate-800/80 text-cyan-400 text-xs font-medium border border-cyan-500/30 transition-all shadow-sm"
          >
            <FolderDown className="w-4 h-4" />
            <span>{t('autoInstallBundled')}</span>
          </button>
        </div>

        {/* Alerts */}
        {actionError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 space-x-reverse">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 space-x-reverse">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}
      </div>

      {/* Manual File Import Form */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <h3 className="text-sm font-bold text-slate-100 mb-2">{t('manualSelectTitle')}</h3>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          {t('manualSelectDesc')}
        </p>

        <div className="space-y-4">
          {/* ASR Model Picker */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              {t('asrFileLabel')}
            </label>
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="text"
                readOnly
                value={asrPath}
                placeholder="..."
                className="flex-1 bg-navy-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none"
                dir="ltr"
              />
              <button
                onClick={handleSelectAsrFile}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors shrink-0"
              >
                {t('browseFile')}
              </button>
            </div>
          </div>

          {/* VAD Model Picker */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              {t('vadFileLabel')}
            </label>
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="text"
                readOnly
                value={vadPath}
                placeholder="..."
                className="flex-1 bg-navy-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none"
                dir="ltr"
              />
              <button
                onClick={handleSelectVadFile}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors shrink-0"
              >
                {t('browseFile')}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleImport}
              disabled={isImporting || !asrPath || !vadPath}
              className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs disabled:opacity-40 transition-all shadow-lg shadow-cyan-500/20"
            >
              <HardDrive className="w-4 h-4" />
              <span>{isImporting ? t('validating') : t('validateAndInstall')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Model Technical Specifications */}
      <div className="bg-navy-950/50 border border-slate-800/70 rounded-2xl p-5 text-xs text-slate-400 space-y-2 shadow-inner">
        <div className="flex items-center space-x-2 space-x-reverse text-slate-200 font-semibold">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>{t('techSpecsTitle')}</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-400 leading-relaxed">
          <li>{t('techSpec1')}</li>
          <li>{t('techSpec2')}</li>
          <li>{t('techSpec3')}</li>
          <li>{t('techSpec4')}</li>
        </ul>
      </div>
    </div>
  );
};
