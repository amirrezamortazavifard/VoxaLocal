import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Mic, Check } from 'lucide-react';
import { QuickDictationSettings } from '../../types/asr';
import { useLanguage } from '../../i18n/LanguageContext';

export const VocalModeView: React.FC = () => {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'pushToTalk' | 'toggle'>('pushToTalk');
  const [vadThreshold, setVadThreshold] = useState(0.5);
  const [silenceTimeout, setSilenceTimeout] = useState(3.0);
  const [soundFeedback, setSoundFeedback] = useState(true);
  const [savedFeedback, setSavedFeedback] = useState(false);

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
  }, []);

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
    </div>
  );
};
