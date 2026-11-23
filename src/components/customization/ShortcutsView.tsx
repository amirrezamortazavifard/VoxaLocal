import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Keyboard, RotateCcw, Check, ClipboardPaste, Clock } from 'lucide-react';
import { QuickDictationSettings } from '../../types/asr';
import { useLanguage } from '../../i18n/LanguageContext';

export const ShortcutsView: React.FC = () => {
  const { t, language } = useLanguage();
  const [settings, setSettings] = useState<QuickDictationSettings>({
    enabled: true,
    shortcut: 'Ctrl+Shift+Space',
    mode: 'toggle',
    autoPaste: false,
    timeoutSeconds: 15,
    showWaveform: true,
  });

  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const recordBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    invoke<QuickDictationSettings>('get_quick_dictation_settings')
      .then((s) => setSettings(s))
      .catch(console.error);
  }, []);

  const handleSave = async (updated: QuickDictationSettings) => {
    setSettings(updated);
    setErrorMsg(null);
    try {
      await invoke('update_quick_dictation_settings', { settings: updated });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err: any) {
      setErrorMsg(String(err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    let keyName = e.key;
    if (keyName === ' ') keyName = 'Space';
    else if (keyName.length === 1) keyName = keyName.toUpperCase();

    parts.push(keyName);
    const combo = parts.join('+');

    setIsRecording(false);
    handleSave({ ...settings, shortcut: combo });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5 space-x-reverse">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <span>{t('tabShortcuts')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'fa'
              ? 'شخصی‌سازی کلید میانبر سراسری و رفتار درج خودکار متن در سایر برنامه‌ها.'
              : 'Customize global Push-to-Talk hotkeys and auto-paste behaviors across all desktop applications.'}
          </p>
        </div>

        {savedFeedback && (
          <span className="flex items-center space-x-1.5 space-x-reverse text-xs text-emerald-400 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{t('saved')}</span>
          </span>
        )}
      </div>

      {/* Main Hotkey Card */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">
              {t('currentShortcutLabel')}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === 'fa'
                ? 'با فشردن این کلید در هر برنامه‌ای، دیکته صوتی فعال می‌شود.'
                : 'Press this shortcut in any desktop app to start dictating immediately.'}
            </p>
          </div>

          <button
            onClick={() => handleSave({ ...settings, enabled: !settings.enabled })}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              settings.enabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-white/[0.05] text-slate-500 border border-white/5'
            }`}
          >
            {settings.enabled ? (language === 'fa' ? 'فعال' : 'Enabled') : (language === 'fa' ? 'غیرفعال' : 'Disabled')}
          </button>
        </div>

        {/* Shortcut Recorder Button */}
        <div className="flex items-center space-x-3 space-x-reverse">
          <button
            ref={recordBtnRef}
            onClick={() => setIsRecording(true)}
            onKeyDown={handleKeyDown}
            onBlur={() => setIsRecording(false)}
            className={`flex-1 py-4 px-6 rounded-2xl border text-center transition-all cursor-pointer shadow-inner ${
              isRecording
                ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300 ring-4 ring-cyan-500/20 animate-pulse font-bold text-sm'
                : 'bg-[#121316] border-white/10 hover:border-white/20 text-white font-mono text-sm'
            }`}
          >
            {isRecording ? t('recordingShortcut') : settings.shortcut}
          </button>

          <button
            onClick={() => handleSave({ ...settings, shortcut: 'Ctrl+Shift+Space' })}
            className="p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={t('resetDefaultShortcut')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <p className="text-xs text-rose-400 font-mono bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            {errorMsg}
          </p>
        )}
      </div>

      {/* Auto Paste & Behaviors */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {language === 'fa' ? 'رفتار پس از پایان دیکته' : 'Post-Dictation Actions'}
        </h3>

        {/* Auto-paste */}
        <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
          <div className="flex items-center space-x-3 space-x-reverse">
            <ClipboardPaste className="w-4 h-4 text-cyan-400" />
            <div>
              <p className="text-xs font-medium text-white">{t('autoPasteLabel')}</p>
              <p className="text-[11px] text-slate-400">
                {language === 'fa'
                  ? 'متن نهایی مستقیماً در برنامه‌ای که قبل از میانبر فعال بوده جای‌گذاری می‌شود.'
                  : 'Automatically injects transcribed text into the previous foreground app using synthetic keystrokes.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => handleSave({ ...settings, autoPaste: !settings.autoPaste })}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              settings.autoPaste
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-white/[0.05] text-slate-400'
            }`}
          >
            {settings.autoPaste ? (language === 'fa' ? 'فعال' : 'ON') : (language === 'fa' ? 'غیرفعال' : 'OFF')}
          </button>
        </div>

        {/* Result auto-close */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-3 space-x-reverse">
            <Clock className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-xs font-medium text-white">{t('autoCloseTimeoutLabel')}</p>
              <p className="text-[11px] text-slate-400">
                {language === 'fa'
                  ? 'بستن خودکار کپسول در صورت عدم ویرایش پس از پایان ضبط.'
                  : 'Auto-dismiss overlay after speech finishes if no manual edits occur.'}
              </p>
            </div>
          </div>

          <span className="font-mono text-xs text-amber-300 bg-white/[0.06] px-2.5 py-1 rounded-lg">
            {settings.timeoutSeconds}s
          </span>
        </div>
      </div>
    </div>
  );
};
