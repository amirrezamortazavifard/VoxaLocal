import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, Mic, Sliders, CheckCircle2 } from 'lucide-react';
import { AudioDeviceInfo, ModelInfo, RecognitionSettings } from '../../types/asr';
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

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    async function loadAudioDevices() {
      try {
        const list = await invoke<AudioDeviceInfo[]>('list_input_devices');
        setDevices(list);
        const current = await invoke<string | null>('get_audio_device_config');
        setSelectedDevice(current);
      } catch (err) {
        console.error('Failed to load audio devices:', err);
      }
    }
    loadAudioDevices();
  }, []);

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
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
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

      {/* Model Manager Section */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl">
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
