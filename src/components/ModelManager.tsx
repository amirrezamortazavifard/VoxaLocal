import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Cpu, CheckCircle2, AlertTriangle, HardDrive, RefreshCw, Layers, FolderDown } from 'lucide-react';
import { ModelInfo } from '../types/asr';

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
      setActionError('لطفاً هر دو فایل مدل ASR و Silero VAD را انتخاب نمایید.');
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
      setSuccessMessage('مدل‌های رسمی با موفقیت اعتبارسنجی و در حافظه محلی نرم‌افزار نصب شدند.');
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
      // Relative paths to the repository's official models
      const bundledAsr = '../vendor/tinyasr/models/en-fa.tzf.gz';
      const bundledVad = '../vendor/tinyasr/models/silero_vad.onnx.gz';

      await invoke('import_model_files', {
        asrPath: bundledAsr,
        vadPath: bundledVad,
      });
      await onRefresh();
      setSuccessMessage('مدل‌های رسمی Persian-English en-fa و Silero VAD با موفقیت نصب و فعال شدند.');
    } catch (err: any) {
      setActionError(`خطا در نصب مدل‌های پیش‌فرض: ${String(err)}`);
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
      setSuccessMessage('مدل با موفقیت در رم بارگذاری شد و موتور آماده تشخیص گفتار است.');
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
      setSuccessMessage('مدل از حافظه رم خارج شد.');
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
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">مدیریت و بارگذاری مدل‌های TinyASR</h2>
              <p className="text-xs text-slate-400">
                پشتیبانی از مدل رسمی دوزبانه فارسی-انگلیسی Zipformer2 به همراه Silero VAD v5
              </p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 transition-colors"
            title="بروزرسانی وضعیت"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Current Status Box */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] text-slate-400 block mb-1">وضعیت نصب</span>
            <div className="flex items-center space-x-2 space-x-reverse">
              {modelInfo?.isInstalled ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300">نصب شده</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">نصب نشده</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] text-slate-400 block mb-1">وضعیت حافظه (RAM)</span>
            <div className="flex items-center space-x-2 space-x-reverse">
              {modelInfo?.isLoaded ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span className="text-xs font-semibold text-cyan-300">بارگذاری شده (آماده)</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                  <span className="text-xs font-semibold text-slate-400">تخلیه شده</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] text-slate-400 block mb-1">زبان‌های مدل</span>
            <div className="flex items-center space-x-1.5 space-x-reverse">
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

          <div className="bg-navy-950/80 border border-slate-800 p-4 rounded-xl">
            <span className="text-[11px] text-slate-400 block mb-1">حجم مدل‌ها</span>
            <span className="text-xs font-mono text-slate-200">
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
              <span>{isLoading ? 'در حال بارگذاری...' : 'بارگذاری مدل در حافظه RAM'}</span>
            </button>
          )}

          {modelInfo?.isLoaded && (
            <button
              onClick={handleUnload}
              disabled={isLoading}
              className="flex items-center space-x-2 space-x-reverse px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 disabled:opacity-50 transition-all"
            >
              <span>{isLoading ? 'در حال تخلیه...' : 'تخلیه مدل از RAM'}</span>
            </button>
          )}

          <button
            onClick={handleImportBundled}
            disabled={isImporting}
            className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-navy-950 hover:bg-slate-800/80 text-cyan-400 text-xs font-medium border border-cyan-500/30 transition-all"
          >
            <FolderDown className="w-4 h-4" />
            <span>نصب خودکار مدل‌های داخلی پروژه</span>
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
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-slate-100 mb-2">انتخاب دستی فایل‌های مدل از سیستم</h3>
        <p className="text-xs text-slate-400 mb-6">
          می‌توانید فایل‌های دانلود شده مدل بازشناسی (en-fa.tzf یا en-fa.tzf.gz) و مدل VAD (silero_vad.onnx یا silero_vad.onnx.gz) را به صورت دستی وارد کنید:
        </p>

        <div className="space-y-4">
          {/* ASR Model Picker */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              فایل مدل تشخیص گفتار (en-fa.tzf یا en-fa.tzf.gz):
            </label>
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="text"
                readOnly
                value={asrPath}
                placeholder="مسیری انتخاب نشده است..."
                className="flex-1 bg-navy-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none"
                dir="ltr"
              />
              <button
                onClick={handleSelectAsrFile}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors shrink-0"
              >
                انتخاب فایل...
              </button>
            </div>
          </div>

          {/* VAD Model Picker */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              فایل مدل Silero VAD (silero_vad.onnx یا silero_vad.onnx.gz):
            </label>
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="text"
                readOnly
                value={vadPath}
                placeholder="مسیری انتخاب نشده است..."
                className="flex-1 bg-navy-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none"
                dir="ltr"
              />
              <button
                onClick={handleSelectVadFile}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors shrink-0"
              >
                انتخاب فایل...
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleImport}
              disabled={isImporting || !asrPath || !vadPath}
              className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs disabled:opacity-40 transition-all"
            >
              <HardDrive className="w-4 h-4" />
              <span>{isImporting ? 'در حال بررسی و اعتبارسنجی...' : 'بررسی و نصب مدل‌های انتخابی'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Model Architecture & Provenance Info */}
      <div className="bg-navy-950/40 border border-slate-800/60 rounded-2xl p-5 text-xs text-slate-400 space-y-2">
        <div className="flex items-center space-x-2 space-x-reverse text-slate-200 font-semibold">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>مشخصات فنی مدل رسمی TinyASR Zipformer2</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-400 mr-2 leading-relaxed">
          <li>نام مدل: <span className="font-mono text-cyan-300">en-fa.tzf</span> (~60M parameters, Zipformer2 RNN-T / TDT).</li>
          <li>کدک و کوانتیزاسیون: وزن‌های int4 فشرده به همراه ماتریس‌های SIMD بومی x86_64 AVX2 / AVX-512 VNNI.</li>
          <li>تشخیص فعالیت صوتی: <span className="font-mono text-cyan-300">Silero VAD v5</span> (16,000 Hz, STFT Convolutions + LSTM).</li>
          <li>مجوز: GNU General Public License v3.0 or later (GPL-3.0-or-later).</li>
        </ul>
      </div>
    </div>
  );
};
