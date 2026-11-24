import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, Mic, Sliders, CheckCircle2, Power, RefreshCw, Download, AlertCircle } from 'lucide-react';
import { AudioDeviceInfo, ModelInfo, RecognitionSettings, UpdateCheckResult } from '../../types/asr';
import { ModelManager } from '../ModelManager';
import { useLanguage } from '../../i18n/LanguageContext';

interface SystemViewProps {
  modelInfo: ModelInfo | null;
  settings: RecognitionSettings;
  onRefreshModels: () => Promise<void>;
  onLoadModels: (threads?: number) => Promise<any>;
  onUnloadModels: () => Promise<any>;
  onUpdateSettings: (settings: RecognitionSettings) => Promise<any>;
}

export const SystemView: React.FC<SystemViewProps> = ({
  modelInfo,
  settings,
  onRefreshModels,
  onLoadModels,
  onUnloadModels,
  onUpdateSettings,
}) => {
  const { t, language } = useLanguage();
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<RecognitionSettings>(settings);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Startup & Auto-Update states
  const [autoStart, setAutoStart] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    async function loadAudioDevicesAndSystemFlags() {
      try {
        const list = await invoke<AudioDeviceInfo[]>('list_input_devices');
        setDevices(list);
        const current = await invoke<string | null>('get_audio_device_config');
        setSelectedDevice(current);
      } catch (err) {
        console.error('Failed to load audio devices:', err);
      }

      try {
        const startupEnabled = await invoke<boolean>('get_autostart_enabled');
        setAutoStart(startupEnabled);
        const updateEnabled = await invoke<boolean>('get_auto_update_enabled');
        setAutoUpdate(updateEnabled);
        const pending = await invoke<any>('get_pending_update');
        if (pending?.version) {
          setDownloadedVersion(pending.version);
        }
      } catch (err) {
        console.error('Failed to load startup/update flags:', err);
      }
    }
    loadAudioDevicesAndSystemFlags();
  }, []);

  const handleToggleAutoStart = async () => {
    const next = !autoStart;
    try {
      await invoke('set_autostart_enabled', { enabled: next });
      setAutoStart(next);
    } catch (err) {
      console.error('Failed to toggle autostart:', err);
    }
  };

  const handleToggleAutoUpdate = async () => {
    const next = !autoUpdate;
    try {
      await invoke('set_auto_update_enabled', { enabled: next });
      setAutoUpdate(next);
    } catch (err) {
      console.error('Failed to toggle auto-update:', err);
    }
  };

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMsg(null);
    try {
      const res = await invoke<UpdateCheckResult>('check_for_updates', { silent: false });
      if (res.updateAvailable && res.updateInfo) {
        setDownloadedVersion(res.updateInfo.version);
        setUpdateStatusMsg({
          type: 'success',
          text:
            language === 'fa'
              ? `نسخه جدید v${res.updateInfo.version} دانلود شد و آماده نصب است.`
              : `New version v${res.updateInfo.version} downloaded and ready to install.`,
        });
      } else {
        setUpdateStatusMsg({
          type: 'info',
          text:
            language === 'fa'
              ? `نرم‌افزار به‌روز است (نسخه فعلی: v${res.currentVersion}).`
              : `You are on the latest version (v${res.currentVersion}).`,
        });
      }
    } catch (err) {
      setUpdateStatusMsg({
        type: 'error',
        text:
          language === 'fa'
            ? `خطا در بررسی به‌روزرسانی (اتصال اینترنت را بررسی کنید): ${String(err)}`
            : `Failed to check for updates (check internet connection): ${String(err)}`,
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallAndRestart = async () => {
    try {
      await invoke('install_and_restart_update');
    } catch (err) {
      console.error('Failed to install update:', err);
    }
  };

  const handleDeviceChange = async (deviceName: string) => {
    const val = deviceName === '__default__' ? null : deviceName;
    setSelectedDevice(val);
    try {
      await invoke('select_input_device', { deviceName: val });
    } catch (err) {
      console.error('Failed to change device:', err);
    }
  };

  const handleSaveInference = async () => {
    try {
      await onUpdateSettings(localSettings);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 w-full max-w-full space-y-4 font-sans select-none text-slate-200 min-w-0">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5 space-x-reverse">
            <Cpu className="w-5 h-5 text-rose-400" />
            <span>{t('tabSystem')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'fa'
              ? 'پیکربندی سخت‌افزار صوتی، انتخاب میکروفون ورودی، مدیریت مدل‌های TinyASR و تنظیم نخ‌های پردازشی.'
              : 'Configure audio input hardware, manage local TinyASR Zipformer2 models, and allocate CPU threads.'}
          </p>
        </div>

        {savedFeedback && (
          <span className="flex items-center space-x-1.5 space-x-reverse text-xs text-emerald-400 animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('saved')}</span>
          </span>
        )}
      </div>

      {/* Audio Hardware Input Device */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-2.5 space-x-reverse text-white text-sm font-semibold">
          <Mic className="w-4 h-4 text-cyan-400" />
          <span>{language === 'fa' ? 'دستگاه ورودی صوتی (میکروفون)' : 'Audio Input Device'}</span>
        </div>

        <select
          value={selectedDevice || '__default__'}
          onChange={(e) => handleDeviceChange(e.target.value)}
          className="w-full bg-[#121316] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
        >
          <option value="__default__" className="bg-[#18191d] text-white">
            {language === 'fa' ? 'میکروفون پیش‌فرض سیستم (Default)' : 'System Default Microphone'}
          </option>
          {devices.map((d) => (
            <option key={d.id} value={d.name} className="bg-[#18191d] text-white">
              {d.name} {d.isDefault ? `(${language === 'fa' ? 'پیش‌فرض' : 'Default'})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* CPU Threads & Beam Search Configuration */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-2.5 space-x-reverse text-white text-sm font-semibold">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>{language === 'fa' ? 'پارامترهای استنتاج عصبی' : 'Neural Inference Parameters'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Threads */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-300">
              {language === 'fa' ? 'تعداد نخ‌های پردازشی (CPU Threads):' : 'CPU Inference Threads:'}
            </label>
            <input
              type="number"
              min="1"
              max="32"
              value={localSettings.threads}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, threads: parseInt(e.target.value) || 4 })
              }
              className="w-full bg-[#121316] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          {/* Beam Width */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-300">
              {language === 'fa' ? 'عرض پرتو جستجو (Beam Width):' : 'Search Beam Width:'}
            </label>
            <select
              value={localSettings.beamWidth}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, beamWidth: parseInt(e.target.value) || 4 })
              }
              className="w-full bg-[#121316] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="1" className="bg-[#18191d] text-white">1 (Greedy - سریع‌ترین)</option>
              <option value="2" className="bg-[#18191d] text-white">2 (Fast Beam)</option>
              <option value="4" className="bg-[#18191d] text-white">4 (پیش‌فرض - تعادل دقت و سرعت)</option>
              <option value="8" className="bg-[#18191d] text-white">8 (بالاترین دقت)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveInference}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
          >
            {t('saveSettings')}
          </button>
        </div>
      </div>

      {/* Windows Startup & Silent GitHub Auto-Updater */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex items-center space-x-2.5 space-x-reverse text-white text-sm font-semibold">
          <Power className="w-4 h-4 text-emerald-400" />
          <span>{language === 'fa' ? 'اجرای خودکار در استارتاپ و به‌روزرسانی' : 'Windows Startup & Auto-Update'}</span>
        </div>

        {/* Autostart Toggle */}
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.06]">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-medium text-slate-200">
              {language === 'fa' ? 'اجرای خودکار هنگام روشن شدن ویندوز (Startup)' : 'Launch VoxaLocal at Windows Startup'}
            </p>
            <p className="text-[11px] text-slate-400">
              {language === 'fa'
                ? 'نرم‌افزار هنگام ورود به ویندوز به صورت خودکار در پس‌زمینه اجرا می‌شود تا کلید میانبر همیشه آماده باشد.'
                : 'Automatically start VoxaLocal in the background when you sign in to Windows.'}
            </p>
          </div>
          <button
            onClick={handleToggleAutoStart}
            className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
              autoStart ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
            aria-label="Toggle Windows Startup"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                autoStart
                  ? language === 'fa'
                    ? '-translate-x-5'
                    : 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Silent Auto-Update Toggle */}
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.06]">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-medium text-slate-200">
              {language === 'fa' ? 'بررسی و دانلود سایلنت به‌روزرسانی از گیت‌هاب' : 'Silent Background Auto-Update (GitHub Releases)'}
            </p>
            <p className="text-[11px] text-slate-400">
              {language === 'fa'
                ? 'در صورت اتصال به اینترنت، نسخه جدید را به صورت سایلنت دانلود کرده و فقط برای نصب و ریست اجازه می‌گیرد.'
                : 'When online, silently downloads new releases in the background and prompts only to install & restart.'}
            </p>
          </div>
          <button
            onClick={handleToggleAutoUpdate}
            className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
              autoUpdate ? 'bg-cyan-500' : 'bg-slate-700'
            }`}
            aria-label="Toggle Silent Auto-Update"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                autoUpdate
                  ? language === 'fa'
                    ? '-translate-x-5'
                    : 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Manual Check & Install Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleManualUpdateCheck}
              disabled={isCheckingUpdate}
              className="flex items-center space-x-1.5 space-x-reverse px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>
                {isCheckingUpdate
                  ? language === 'fa'
                    ? 'در حال بررسی...'
                    : 'Checking...'
                  : language === 'fa'
                    ? 'بررسی دستی به‌روزرسانی'
                    : 'Check for Updates'}
              </span>
            </button>

            {downloadedVersion && (
              <button
                onClick={handleInstallAndRestart}
                className="flex items-center space-x-1.5 space-x-reverse px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {language === 'fa'
                    ? `نصب نسخه v${downloadedVersion} و راه‌اندازی مجدد`
                    : `Install v${downloadedVersion} & Restart`}
                </span>
              </button>
            )}
          </div>

          <span className="text-[11px] font-mono text-slate-500" dir="ltr">
            Current: v1.0.0
          </span>
        </div>

        {updateStatusMsg && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 space-x-reverse border ${
              updateStatusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : updateStatusMsg.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
            }`}
          >
            {updateStatusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{updateStatusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Model Manager Section */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-xl p-4 sm:p-5 shadow-xl">
        <ModelManager
          modelInfo={modelInfo}
          onRefresh={onRefreshModels}
          onLoad={onLoadModels}
          onUnload={onUnloadModels}
        />
      </div>
    </div>
  );
};
