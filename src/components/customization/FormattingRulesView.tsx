import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlignLeft, Check, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface ReplacementRule {
  id: string;
  trigger: string;
  replacement: string;
  enabled: boolean;
}

const DEFAULT_RULES: ReplacementRule[] = [
  { id: '1', trigger: 'علامت سوال', replacement: '؟', enabled: true },
  { id: '2', trigger: 'نقطه', replacement: '.', enabled: true },
  { id: '3', trigger: 'ویرگول', replacement: '،', enabled: true },
  { id: '4', trigger: 'دو نقطه', replacement: ':', enabled: true },
  { id: '5', trigger: 'خط بعد', replacement: '\n', enabled: true },
  { id: '6', trigger: 'question mark', replacement: '?', enabled: true },
  { id: '7', trigger: 'comma', replacement: ',', enabled: true },
  { id: '8', trigger: 'new line', replacement: '\n', enabled: true },
];

export const FormattingRulesView: React.FC = () => {
  const { t, language } = useLanguage();
  const [rules, setRules] = useState<ReplacementRule[]>(DEFAULT_RULES);
  const [smartZwnj, setSmartZwnj] = useState(true);
  const [autoCapitalize, setAutoCapitalize] = useState(true);
  const [trigger, setTrigger] = useState('');
  const [replacement, setReplacement] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    invoke<string | null>('get_app_setting', { key: 'formatting_rules' })
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (parsed.rules) setRules(parsed.rules);
            if (typeof parsed.smartZwnj === 'boolean') setSmartZwnj(parsed.smartZwnj);
            if (typeof parsed.autoCapitalize === 'boolean') setAutoCapitalize(parsed.autoCapitalize);
          } catch {}
        }
      })
      .catch(console.error);
  }, []);

  const persist = async (newRules: ReplacementRule[], zwnj: boolean, cap: boolean) => {
    setRules(newRules);
    setSmartZwnj(zwnj);
    setAutoCapitalize(cap);
    try {
      await invoke('set_app_setting', {
        key: 'formatting_rules',
        value: JSON.stringify({ rules: newRules, smartZwnj: zwnj, autoCapitalize: cap }),
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1500);
    } catch (err) {
      console.error('Failed to save formatting rules:', err);
    }
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trigger.trim() || !replacement.trim()) return;

    const newRule: ReplacementRule = {
      id: crypto.randomUUID(),
      trigger: trigger.trim(),
      replacement: replacement.trim(),
      enabled: true,
    };
    persist([newRule, ...rules], smartZwnj, autoCapitalize);
    setTrigger('');
    setReplacement('');
  };

  const handleToggleRule = (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    persist(updated, smartZwnj, autoCapitalize);
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    persist(updated, smartZwnj, autoCapitalize);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5 space-x-reverse">
            <AlignLeft className="w-5 h-5 text-blue-400" />
            <span>{t('tabFormattingRules')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'fa'
              ? 'تبدیل خودکار کلمات علائم نگارشی گفتاری به نمادها و اعمال نیم‌فاصله هوشمند فارسی.'
              : 'Automatic spoken punctuation replacement, typographic normalization, and smart spacing.'}
          </p>
        </div>

        {savedFeedback && (
          <span className="flex items-center space-x-1.5 space-x-reverse text-xs text-emerald-400 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{t('saved')}</span>
          </span>
        )}
      </div>

      {/* Toggles Card */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {language === 'fa' ? 'قواعد نگارش هوشمند' : 'Typographic Enhancements'}
        </h3>

        {/* Smart ZWNJ */}
        <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
          <div>
            <p className="text-xs font-medium text-white">{t('smartZwnj')}</p>
            <p className="text-[11px] text-slate-400">
              {language === 'fa'
                ? 'اعمال خودکار نیم‌فاصله در پیشوندها (می/نمی) و پسوندها (ها/تر/ترین/ای/ام).'
                : 'Auto-apply Persian Zero-Width Non-Joiner (ZWNJ) on standard affixes.'}
            </p>
          </div>
          <button
            onClick={() => persist(rules, !smartZwnj, autoCapitalize)}
            className="cursor-pointer text-cyan-400 hover:text-cyan-300"
          >
            {smartZwnj ? <ToggleRight className="w-7 h-7 text-cyan-400" /> : <ToggleLeft className="w-7 h-7 text-slate-600" />}
          </button>
        </div>

        {/* Auto Capitalization */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-xs font-medium text-white">
              {language === 'fa' ? 'حروف بزرگ خودکار انگلیسی' : 'English Auto-Capitalization'}
            </p>
            <p className="text-[11px] text-slate-400">
              {language === 'fa'
                ? 'بزرگ کردن حرف اول جملات انگلیسی پس از پایان بند.'
                : 'Capitalize first letter of English sentences after terminal punctuation.'}
            </p>
          </div>
          <button
            onClick={() => persist(rules, smartZwnj, !autoCapitalize)}
            className="cursor-pointer text-cyan-400 hover:text-cyan-300"
          >
            {autoCapitalize ? <ToggleRight className="w-7 h-7 text-cyan-400" /> : <ToggleLeft className="w-7 h-7 text-slate-600" />}
          </button>
        </div>
      </div>

      {/* Add Replacement Rule */}
      <form onSubmit={handleAddRule} className="flex gap-2">
        <input
          type="text"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder={language === 'fa' ? 'کلمه گفتاری (مثال: علامت تعجب)...' : 'Spoken phrase (e.g. exclamation mark)...'}
          className="flex-1 bg-[#18191d] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          dir="auto"
        />
        <input
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder={language === 'fa' ? 'جایگزین (مثال: !)...' : 'Replacement (e.g. !)...'}
          className="w-40 bg-[#18191d] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 text-center"
          dir="auto"
        />
        <button
          type="submit"
          className="flex items-center space-x-1.5 space-x-reverse px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{language === 'fa' ? 'افزودن قاعده' : 'Add Rule'}</span>
        </button>
      </form>

      {/* Rules Table */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-4 shadow-xl space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-all group"
          >
            <div className="flex items-center space-x-3 space-x-reverse">
              <button
                onClick={() => handleToggleRule(rule.id)}
                className="cursor-pointer"
              >
                {rule.enabled ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-600" />
                )}
              </button>
              <span className={`text-xs ${rule.enabled ? 'text-slate-200' : 'text-slate-500 line-through'}`} dir="auto">
                «{rule.trigger}»
              </span>
              <span className="text-slate-500 text-xs">→</span>
              <span className="text-xs font-mono font-bold text-cyan-300 bg-white/[0.05] px-2 py-0.5 rounded">
                {rule.replacement === '\n' ? '↵ Newline' : rule.replacement}
              </span>
            </div>

            <button
              onClick={() => handleDeleteRule(rule.id)}
              className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              title={t('deleteItem')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
