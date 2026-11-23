import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookA, Plus, Trash2, Search, Check } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface DictionaryEntry {
  id: string;
  word: string;
  category?: string;
}

const DEFAULT_DICTIONARY: DictionaryEntry[] = [
  { id: '1', word: 'VoxaLocal', category: 'Brand' },
  { id: '2', word: 'TinyASR', category: 'Technology' },
  { id: '3', word: 'امیررضا', category: 'Name' },
  { id: '4', word: 'هوش مصنوعی', category: 'Term' },
  { id: '5', word: 'Zipformer2', category: 'Technology' },
];

export const CustomDictionaryView: React.FC = () => {
  const { t, language } = useLanguage();
  const [entries, setEntries] = useState<DictionaryEntry[]>(DEFAULT_DICTIONARY);
  const [searchTerm, setSearchTerm] = useState('');
  const [newWord, setNewWord] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    // Load from SQLite app settings
    invoke<string | null>('get_app_setting', { key: 'custom_dictionary' })
      .then((val) => {
        if (val) {
          try {
            setEntries(JSON.parse(val));
          } catch {}
        }
      })
      .catch(console.error);
  }, []);

  const persistEntries = async (updated: DictionaryEntry[]) => {
    setEntries(updated);
    try {
      await invoke('set_app_setting', {
        key: 'custom_dictionary',
        value: JSON.stringify(updated),
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1500);
    } catch (err) {
      console.error('Failed to save dictionary:', err);
    }
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newWord.trim();
    if (!trimmed) return;
    if (entries.some((item) => item.word.toLowerCase() === trimmed.toLowerCase())) return;

    const updated = [
      { id: crypto.randomUUID(), word: trimmed, category: 'Custom' },
      ...entries,
    ];
    persistEntries(updated);
    setNewWord('');
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter((item) => item.id !== id);
    persistEntries(updated);
  };

  const filtered = entries.filter((item) =>
    item.word.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5 space-x-reverse">
            <BookA className="w-5 h-5 text-indigo-400" />
            <span>{t('tabDictionary')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'fa'
              ? 'واژه‌ها، اصطلاحات تخصصی و اسامی خاص خود را اضافه کنید تا در رونویسی با دقت بالا ثبت شوند.'
              : 'Add custom vocabulary, technical terms, and proper names to prioritize during speech recognition.'}
          </p>
        </div>

        {savedFeedback && (
          <span className="flex items-center space-x-1.5 space-x-reverse text-xs text-emerald-400 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{t('saved')}</span>
          </span>
        )}
      </div>

      {/* Add New Word Form */}
      <form onSubmit={handleAddWord} className="flex gap-2">
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          placeholder={language === 'fa' ? 'افزودن واژه یا نام جدید...' : 'Add new word or phrase...'}
          className="flex-1 bg-[#18191d] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          dir="auto"
        />
        <button
          type="submit"
          className="flex items-center space-x-1.5 space-x-reverse px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{language === 'fa' ? 'افزودن واژه' : 'Add Word'}</span>
        </button>
      </form>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={language === 'fa' ? 'جستجو در واژگان...' : 'Search dictionary...'}
          className="w-full bg-[#18191d]/60 border border-white/[0.06] rounded-xl ps-9 pe-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Words Grid */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-all group"
            >
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="text-xs font-medium text-slate-200" dir="auto">
                  {item.word}
                </span>
                {item.category && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 font-mono">
                    {item.category}
                  </span>
                )}
              </div>

              <button
                onClick={() => handleDelete(item.id)}
                className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                title={t('deleteItem')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500">
            {language === 'fa' ? 'واژه‌ای یافت نشد.' : 'No words found in dictionary.'}
          </div>
        )}
      </div>
    </div>
  );
};
