import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Mic, Cpu, ShieldCheck, Sliders, CheckCircle2, Globe } from 'lucide-react';
import { AudioDeviceInfo, RecognitionSettings } from '../types/asr';
import { useLanguage } from '../i18n/LanguageContext';

interface SettingsModalProps {
  settings: RecognitionSettings;
  onUpdateSettings: (settings: RecognitionSettings) => Promise<any>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t, language, setLanguage } = useLanguage();
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
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center space-x-3 space-x-reverse mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">{t('settingsTitle')}</h2>
            <p className="text-xs text-slate-400">
              {t('settingsSubtitle')}
            </p>
          </div>
        </div>

        {/* Section 0: UI Language Selection */}
        <div className="space-y-3 pt-4 border-t border-slate-800">
          <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>{t('uiLanguage')}</span>
          </div>
          <div className="flex items-center space-x-3 space-x-reverse">
            <button
              onClick={() => setLanguage('fa')}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                language === 'fa'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold shadow-sm'
                  : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              فارسی (Persian)
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all font-mono ${
                language === 'en'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold shadow-sm'
                  : 'bg-navy-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Section 1: Microphone */}
        <div className="space-y-4 pt-6 border-t border-slate-800 mt-6">
          <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
            <Mic className="w-4 h-4 text-cyan-400" />
            <span>{t('micSectionTitle')}</span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">{t('selectMicLabel')}</label>
            <select
              value={selectedDevice || '__default__'}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 shadow-inner"
            >
              <option value="__default__">{t('defaultMic')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({d.channels} ch, {d.defaultSampleRate}Hz)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section 2: Recognition Engine */}
        <div className="space-y-4 pt-6 border-t border-slate-800 mt-6">
          <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>{t('asrSectionTitle')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Threads */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>{t('threadsLabel')}</span>
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">{localSettings.threads}</span>
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
                {t('threadsHint')}
              </span>
            </div>

            {/* Beam Width */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>{t('beamWidthLabel')}</span>
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">{localSettings.beamWidth}</span>
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
                {t('beamHint')}
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
            <span>{t('saveSettingsBtn')}</span>
          </button>

          {savedMessage && (
            <span className="text-xs text-emerald-400 flex items-center space-x-1 space-x-reverse font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('settingsSaved')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Privacy and Offline Guarantee Card */}
      <div className="bg-navy-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-3 shadow-xl">
        <div className="flex items-center space-x-2 space-x-reverse text-emerald-400 font-bold text-sm">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span>{t('privacyGuaranteeTitle')}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('privacyGuaranteeDesc')}
        </p>
      </div>
    </div>
  );
};
