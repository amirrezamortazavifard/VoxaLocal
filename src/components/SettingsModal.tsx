import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Mic, Cpu, ShieldCheck, Sliders, CheckCircle2 } from 'lucide-react';
import { AudioDeviceInfo, RecognitionSettings } from '../types/asr';

interface SettingsModalProps {
  settings: RecognitionSettings;
  onUpdateSettings: (settings: RecognitionSettings) => Promise<any>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<RecognitionSettings>(settings);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    async function loadDevices() {
      try {
        const list = await invoke<AudioDeviceInfo[]>('list_input_devices');
        setDevices(list);
        const current = await invoke<string | null>('get_audio_device_config');
        setSelectedDevice(current);
      } catch (err) {
        console.error('Failed to list audio devices:', err);
      }
    }
    loadDevices();
  }, []);

  const handleDeviceChange = async (deviceName: string) => {
    const val = deviceName === '__default__' ? null : deviceName;
    setSelectedDevice(val);
    try {
      await invoke('select_input_device', { deviceName: val });
    } catch (err) {
      console.error('Failed to select device:', err);
    }
  };

  const handleSave = async () => {
    try {
      await onUpdateSettings(localSettings);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex items-center space-x-3 space-x-reverse mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">تنظیمات استودیوی VoxLocal</h2>
            <p className="text-xs text-slate-400">
              پیکربندی دستگاه ورودی صوتی، موتور استنتاج TinyASR و تضمین حریم خصوصی آفلاین
            </p>
          </div>
        </div>

        {/* Section 1: Microphone */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
            <Mic className="w-4 h-4 text-cyan-400" />
            <span>دستگاه ورودی میکروفون (CPAL WASAPI)</span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">انتخاب میکروفون:</label>
            <select
              value={selectedDevice || '__default__'}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="__default__">میکروفون پیش‌فرض سیستم (Default)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({d.channels} کانال، {d.defaultSampleRate}Hz)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section 2: Recognition Engine */}
        <div className="space-y-4 pt-6 border-t border-slate-800 mt-6">
          <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>تنظیمات پردازش موتور ASR و نخ‌های پردازنده (CPU Multithreading)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Threads */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>تعداد نخ‌های پردازشی (CPU Threads):</span>
                <span className="font-mono text-cyan-300 font-semibold">{localSettings.threads}</span>
              </div>
              <input
                type="range"
                min={1}
                max={16}
                value={localSettings.threads}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, threads: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                توصیه پیش‌فرض: 4 نخ برای تعادل بهینه سرعت و مصرف باتری.
              </span>
            </div>

            {/* Beam Width */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>عرض پرتو جستجو (Beam Width):</span>
                <span className="font-mono text-cyan-300 font-semibold">{localSettings.beamWidth}</span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                value={localSettings.beamWidth}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, beamWidth: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                مقدار 4 پیش‌فرض TinyASR و بالاترین دقت رونویسی است (مقدار 1 حالت Greedy سریع).
              </span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Sliders className="w-4 h-4" />
            <span>ذخیره تنظیمات</span>
          </button>

          {savedMessage && (
            <span className="text-xs text-emerald-400 flex items-center space-x-1 space-x-reverse">
              <CheckCircle2 className="w-4 h-4" />
              <span>تنظیمات ذخیره شد.</span>
            </span>
          )}
        </div>
      </div>

      {/* Privacy and Offline Guarantee Card */}
      <div className="bg-navy-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-3">
        <div className="flex items-center space-x-2 space-x-reverse text-emerald-400 font-bold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>تضمین عملکرد ۱۰۰٪ آفلاین و حریم خصوصی مطلق</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          نرم‌افزار VoxLocal بدون هیچ‌گونه نیاز به اینترنت، پروکسی یا سرورهای ریموت اجرا می‌شود.
          تمامی داده‌های صوتی ورودی میکروفون تنها در حافظه موقت (RAM) پردازش شده و پس از پایان جلسه رونویسی،
          فقط در صورت تمایل شما در پایگاه‌داده محلی SQLite رایانه‌تان ذخیره خواهند شد. هیچ کلمه یا صوتی به خارج از این سیستم ارسال نخواهد شد.
        </p>
      </div>
    </div>
  );
};
