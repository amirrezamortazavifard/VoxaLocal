import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Mic, Check, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  QuickDictationSettings,
  VoiceActivationSettings,
  VoiceActivationState,
  VoiceActivationStatusPayload,
} from '../../types/asr';
import { useLanguage } from '../../i18n/LanguageContext';

export const VocalModeView: React.FC = () => {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'pushToTalk' | 'toggle'>('pushToTalk');
  const [vadThreshold, setVadThreshold] = useState(0.5);
  const [silenceTimeout, setSilenceTimeout] = useState(3.0);
  const [soundFeedback, setSoundFeedback] = useState(true);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const [vaSettings, setVaSettings] = useState<VoiceActivationSettings>({
    enabled: false,
    wakePhrase: 'hey_voxa',
    mode: 'wake_only',
  });
  const [vaStatus, setVaStatus] = useState<VoiceActivationStatusPayload>({
    enabled: false,
    state: 'disabled',
    wakePhrase: 'hey_voxa',
    mode: 'wake_only',
    errorMessage: null,
    modelReady: false,
  });
  const [vaSaving, setVaSaving] = useState(false);

  useEffect(() => {
    invoke<QuickDictationSettings>('get_quick_dictation_settings')
      .then((s) => {
        setMode(s.mode);
      })
      .catch(console.error);

    invoke<string | null>('get_app_setting', { key: 'vocal_mode_config' })
      .then((val) => {
        if (val) {
          try {
            const p = JSON.parse(val);
            if (typeof p.vadThreshold === 'number') setVadThreshold(p.vadThreshold);
            if (typeof p.silenceTimeout === 'number') setSilenceTimeout(p.silenceTimeout);
            if (typeof p.soundFeedback === 'boolean') setSoundFeedback(p.soundFeedback);
          } catch {}
        }
      })
      .catch(console.error);

    invoke<VoiceActivationSettings>('get_voice_activation_settings')
      .then((s) => setVaSettings(s))
      .catch(console.error);

    invoke<VoiceActivationStatusPayload>('get_voice_activation_status')
      .then((st) => setVaStatus(st))
      .catch(console.error);

    const unlistenPromise = listen<VoiceActivationStatusPayload>(
      'voice-activation://status',
      (event) => {
        setVaStatus(event.payload);
      },
    );

    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const handleToggleVoiceActivation = async () => {
    if (vaSaving) return;
    setVaSaving(true);
    const nextSettings: VoiceActivationSettings = {
      enabled: !vaSettings.enabled,
      wakePhrase: 'hey_voxa',
      mode: 'wake_only',
    };
    try {
      const updated = await invoke<VoiceActivationSettings>('update_voice_activation_settings', {
        settings: nextSettings,
      });
      setVaSettings(updated);
      const status = await invoke<VoiceActivationStatusPayload>('get_voice_activation_status');
      setVaStatus(status);
    } catch (err) {
      console.error('Failed to toggle Voice Activation:', err);
    } finally {
      setVaSaving(false);
    }
  };

  const renderVaStateLabel = (state: VoiceActivationState) => {
    switch (state) {
      case 'disabled':
        return t('vaStatusDisabled');
      case 'starting':
        return t('vaStatusStarting');
      case 'listening':
        return t('vaStatusListening');
      case 'triggered':
        return t('vaStatusTriggered');
      case 'paused_for_recording':
        return t('vaStatusPausedForRecording');
      case 'stopping':
        return t('vaStatusStopping');
      case 'error':
        return t('vaStatusError');
    }
  };

  const vaBadgeStyle = (state: VoiceActivationState) => {
    switch (state) {
      case 'listening':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'triggered':
      case 'starting':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'paused_for_recording':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'error':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800/80 text-slate-400 border-slate-700/60';
    }
  };

  const handleSave = async (newMode: 'pushToTalk' | 'toggle') => {
    setMode(newMode);
    try {
      const qd = await invoke<QuickDictationSettings>('get_quick_dictation_settings');
      await invoke('update_quick_dictation_settings', {
        settings: { ...qd, mode: newMode },
      });
      await invoke('set_app_setting', {
        key: 'vocal_mode_config',
        value: JSON.stringify({
          vadThreshold,
          silenceTimeout,
          soundFeedback,
        }),
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to update vocal mode:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5 space-x-reverse">
            <Mic className="w-5 h-5 text-emerald-400" />
            <span>{t('tabVoiceMode')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'fa'
              ? 'پیکربندی نحوه شروع و پایان ضبط صدا، حساسیت به سکوت و تشخیص هوشمند گفتار (Silero VAD).'
              : 'Configure dictation activation triggers, silence auto-stop, and Silero VAD sensitivity.'}
          </p>
        </div>

        {savedFeedback && (
          <span className="flex items-center space-x-1.5 space-x-reverse text-xs text-emerald-400 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{t('saved')}</span>
          </span>
        )}
      </div>

      {/* Activation Mode Cards */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t('activationModeLabel')}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Push To Talk */}
          <div
            onClick={() => handleSave('pushToTalk')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
              mode === 'pushToTalk'
                ? 'bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                : 'bg-[#18191d] border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">{t('modePushToTalk')}</span>
              {mode === 'pushToTalk' && <Check className="w-4 h-4 text-cyan-400" />}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {language === 'fa'
                ? 'کلید میانبر را هنگام صحبت نگه دارید و به محض رها کردن کلید، متن در برنامه جای‌گذاری می‌شود.'
                : 'Hold the hotkey while speaking. Speech is automatically transcribed and pasted upon release.'}
            </p>
          </div>

          {/* Toggle */}
          <div
            onClick={() => handleSave('toggle')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
              mode === 'toggle'
                ? 'bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                : 'bg-[#18191d] border-white/[0.08] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">{t('modeToggle')}</span>
              {mode === 'toggle' && <Check className="w-4 h-4 text-cyan-400" />}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {language === 'fa'
                ? 'یک‌بار فشردن کلید برای شروع ضبط و فشردن مجدد برای توقف و نهایی‌سازی متن.'
                : 'Press once to start dictation, and press again (or wait for silence) to stop and finalize.'}
            </p>
          </div>
        </div>
      </div>

      {/* VAD Sensitivity & Thresholds */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-6">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {language === 'fa' ? 'حساسیت تشخیص فعالیت صوتی (Silero VAD v5)' : 'Silero VAD v5 Voice Detection'}
        </h3>

        {/* VAD Probability Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">
              {language === 'fa' ? 'آستانه احتمال گفتار (Speech Probability Threshold):' : 'Speech Probability Threshold:'}
            </span>
            <span className="font-mono text-cyan-300 bg-white/[0.06] px-2 py-0.5 rounded">
              {vadThreshold.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="0.8"
            step="0.05"
            value={vadThreshold}
            onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{language === 'fa' ? 'بسیار حساس (نویز کم)' : 'High Sensitivity'}</span>
            <span>{language === 'fa' ? 'مقاوم در برابر نویز محیط' : 'Noise Robust'}</span>
          </div>
        </div>

        {/* Silence Timeout */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">
              {language === 'fa' ? 'مهلت سکوت برای پایان نوبت (ثانیه):' : 'Silence Timeout for End-of-Utterance:'}
            </span>
            <span className="font-mono text-cyan-300 bg-white/[0.06] px-2 py-0.5 rounded">
              {silenceTimeout.toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="6.0"
            step="0.5"
            value={silenceTimeout}
            onChange={(e) => setSilenceTimeout(parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={() => handleSave(mode)}
            className="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
          >
            {t('saveSettings')}
          </button>
        </div>
      </div>

      {/* Offline Voice Activation (Wake Word) */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{t('vaSectionTitle')}</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('vaSectionDesc')}
            </p>
          </div>

          <button
            type="button"
            disabled={vaSaving}
            onClick={handleToggleVoiceActivation}
            aria-pressed={vaSettings.enabled}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all shrink-0 cursor-pointer disabled:opacity-50 ${
              vaSettings.enabled
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {t('vaEnableToggle')}: {vaSettings.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-navy-950/60 border border-white/[0.06] flex items-center justify-between gap-2">
            <span className="text-slate-400 whitespace-nowrap">{t('vaWakePhraseLabel')}</span>
            <span className="font-mono font-semibold text-cyan-300 whitespace-nowrap">
              {t('vaWakePhraseValue')}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-navy-950/60 border border-white/[0.06] flex items-center justify-between gap-2">
            <span className="text-slate-400 whitespace-nowrap">{t('vaModeLabel')}</span>
            <span className="font-semibold text-slate-200 whitespace-nowrap">
              {t('vaModeWakeOnlyValue')}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 whitespace-nowrap">{t('vaStatusLabel')}</span>
            <span
              className={`px-2.5 py-1 rounded-lg border font-medium whitespace-nowrap ${vaBadgeStyle(
                vaStatus.state,
              )}`}
            >
              {renderVaStateLabel(vaStatus.state)}
            </span>
          </div>

          <span
            className={`text-[11px] font-medium whitespace-nowrap ${
              vaStatus.modelReady ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {vaStatus.modelReady ? t('vaModelReady') : t('vaModelMissing')}
          </span>
        </div>

        {vaStatus.errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-words">{vaStatus.errorMessage}</span>
          </div>
        )}

        <div className="p-3.5 rounded-xl bg-cyan-500/[0.05] border border-cyan-500/20 text-[11px] text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{t('vaModeWakeOnlyHint')}</span>
          </div>
          <p className="text-slate-400 leading-relaxed">{t('vaPrivacyNotice')}</p>
        </div>
      </div>
    </div>
  );
};
