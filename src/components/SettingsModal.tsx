import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Settings,
  Mic,
  Cpu,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  Globe,
  Keyboard,
  RotateCcw,
} from 'lucide-react';
import {
  AudioDeviceInfo,
  QuickDictationSettings,
  RecognitionSettings,
} from '../types/asr';
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

  // Quick Dictation Settings
  const [qdSettings, setQdSettings] = useState<QuickDictationSettings>({
    enabled: true,
    shortcut: 'Ctrl+Shift+Space',
    mode: 'pushToTalk',
    autoPaste: false,
    timeoutSeconds: 15,
    showWaveform: true,
  });

  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const recorderRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    async function loadConfig() {
      try {
        const list = await invoke<AudioDeviceInfo[]>('list_input_devices');
        setDevices(list);
        const current = await invoke<string | null>('get_audio_device_config');
        setSelectedDevice(current);

        const qd = await invoke<QuickDictationSettings>('get_quick_dictation_settings');
        setQdSettings(qd);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
    loadConfig();
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
      await invoke('update_quick_dictation_settings', { settings: qdSettings });
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } catch (err: any) {
      console.error('Failed to update settings:', err);
      setShortcutError(String(err));
    }
  };

  // Shortcut key recorder
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecordingShortcut) return;
    e.preventDefault();
    e.stopPropagation();

    // Ignore single modifier presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.altKey) modifiers.push('Alt');

    let keyName = e.code;
    if (keyName.startsWith('Key')) {
      keyName = keyName.replace('Key', '');
    } else if (keyName === 'Space') {
      keyName = 'Space';
    }

    if (modifiers.length === 0) {
      setShortcutError('Shortcut requires at least one modifier key (Ctrl, Shift, or Alt)');
      return;
    }

    const combination = `${modifiers.join('+')}+${keyName}`;
    setQdSettings((prev) => ({ ...prev, shortcut: combination }));
    setIsRecordingShortcut(false);
    setShortcutError(null);
  };

  const handleResetShortcut = () => {
    setQdSettings((prev) => ({ ...prev, shortcut: 'Ctrl+Shift+Space' }));
    setShortcutError(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Title */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center space-x-3 space-x-reverse mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">{t('settingsTitle')}</h2>
            <p className="text-xs text-slate-400">{t('settingsSubtitle')}</p>
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

        {/* Section 1: Global Quick Dictation (Push-to-Talk) */}
        <div className="space-y-4 pt-6 border-t border-slate-800 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
              <Keyboard className="w-4 h-4 text-cyan-400" />
              <span>{t('quickDictationSectionTitle')}</span>
            </div>
            {/* Enable toggle switch */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={qdSettings.enabled}
                onChange={(e) =>
                  setQdSettings((prev) => ({ ...prev, enabled: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {t('quickDictationDesc')}
          </p>

          {qdSettings.enabled && (
            <div className="space-y-4 bg-navy-950/70 p-4 rounded-xl border border-slate-800/80">
              {/* Shortcut Recorder */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">
                  {t('currentShortcutLabel')}
                </label>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <button
                    ref={recorderRef}
                    onClick={() => setIsRecordingShortcut(true)}
                    onKeyDown={handleKeyDown}
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-xs font-mono transition-all text-left flex items-center justify-between ${
                      isRecordingShortcut
                        ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300 ring-2 ring-cyan-500/30'
                        : 'bg-navy-900 border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span>
                      {isRecordingShortcut ? t('recordingShortcut') : qdSettings.shortcut}
                    </span>
                    <span className="text-[10px] text-slate-500 font-sans">
                      {isRecordingShortcut ? 'Listening...' : t('clickToRecordShortcut')}
                    </span>
                  </button>

                  <button
                    onClick={handleResetShortcut}
                    className="p-2.5 rounded-xl bg-navy-900 border border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-slate-700 transition-colors"
                    title={t('resetDefaultShortcut')}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
                {shortcutError && (
                  <span className="text-[11px] text-rose-400 mt-1 block">
                    {shortcutError}
                  </span>
                )}
              </div>

              {/* Activation Mode */}
              <div>
                <label className="text-xs text-slate-400 block mb-2">
                  {t('activationModeLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label
                    className={`flex items-center space-x-2 space-x-reverse p-3 rounded-xl border cursor-pointer transition-all ${
                      qdSettings.mode === 'pushToTalk'
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-medium'
                        : 'bg-navy-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pttMode"
                      value="pushToTalk"
                      checked={qdSettings.mode === 'pushToTalk'}
                      onChange={() =>
                        setQdSettings((prev) => ({ ...prev, mode: 'pushToTalk' }))
                      }
                      className="accent-cyan-400"
                    />
                    <span>{t('modePushToTalk')}</span>
                  </label>

                  <label
                    className={`flex items-center space-x-2 space-x-reverse p-3 rounded-xl border cursor-pointer transition-all ${
                      qdSettings.mode === 'toggle'
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-medium'
                        : 'bg-navy-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pttMode"
                      value="toggle"
                      checked={qdSettings.mode === 'toggle'}
                      onChange={() =>
                        setQdSettings((prev) => ({ ...prev, mode: 'toggle' }))
                      }
                      className="accent-cyan-400"
                    />
                    <span>{t('modeToggle')}</span>
                  </label>
                </div>
              </div>

              {/* Auto-paste toggle */}
              <div className="flex items-start space-x-2 space-x-reverse pt-2">
                <input
                  type="checkbox"
                  id="autoPaste"
                  checked={qdSettings.autoPaste}
                  onChange={(e) =>
                    setQdSettings((prev) => ({ ...prev, autoPaste: e.target.checked }))
                  }
                  className="mt-0.5 accent-cyan-400"
                />
                <label htmlFor="autoPaste" className="text-xs cursor-pointer select-none">
                  <span className="font-semibold text-slate-200 block">
                    {t('autoPasteLabel')}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {t('autoPasteHint')}
                  </span>
                </label>
              </div>

              {/* Waveform toggle */}
              <div className="flex items-center space-x-2 space-x-reverse">
                <input
                  type="checkbox"
                  id="showWaveform"
                  checked={qdSettings.showWaveform}
                  onChange={(e) =>
                    setQdSettings((prev) => ({ ...prev, showWaveform: e.target.checked }))
                  }
                  className="accent-cyan-400"
                />
                <label
                  htmlFor="showWaveform"
                  className="text-xs text-slate-300 cursor-pointer select-none"
                >
                  {t('waveformToggleLabel')}
                </label>
              </div>

              {/* Result Auto-Dismiss Timeout Slider */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>{t('timeoutLabel')}</span>
                  <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                    {qdSettings.timeoutSeconds}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={qdSettings.timeoutSeconds}
                  onChange={(e) =>
                    setQdSettings((prev) => ({
                      ...prev,
                      timeoutSeconds: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Microphone */}
        <div className="space-y-4 pt-6 border-t border-slate-800 mt-6">
          <div className="flex items-center space-x-2 space-x-reverse text-sm font-semibold text-slate-200">
            <Mic className="w-4 h-4 text-cyan-400" />
            <span>{t('micSectionTitle')}</span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">
              {t('selectMicLabel')}
            </label>
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

        {/* Section 3: Recognition Engine & Threads */}
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
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {localSettings.threads}
                </span>
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
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {localSettings.beamWidth}
                </span>
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
            className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
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
