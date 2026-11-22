import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { History, Search, Trash2, Copy, Download, Clock, Calendar, Check } from 'lucide-react';
import { TranscriptRecord } from '../types/asr';
import { exportAsFile } from '../utils/exportFormats';
import { useLanguage } from '../i18n/LanguageContext';

export const HistoryView: React.FC = () => {
  const { t } = useLanguage();
  const [records, setRecords] = useState<TranscriptRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<TranscriptRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const data = await invoke<TranscriptRecord[]>('get_history');
      setRecords(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_history_item', { id });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm(t('confirmClearHistory'))) return;
    try {
      await invoke('clear_history');
      setRecords([]);
      setSelectedRecord(null);
    } catch (err) {
      console.error('Clear failed:', err);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = records.filter(
    (r) =>
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">{t('historyTitle')}</h2>
            <p className="text-xs text-slate-400">
              {t('historySubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 space-x-reverse w-full md:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40 shadow-inner"
            />
          </div>

          {records.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center space-x-1.5 space-x-reverse px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors shrink-0 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('clearAllHistory')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Records List & Detail View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: List */}
        <div className="md:col-span-1 space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="bg-navy-900/40 border border-slate-800/60 rounded-2xl p-8 text-center text-slate-500 text-xs">
              {t('noHistory')}
            </div>
          ) : (
            filtered.map((record) => {
              const isSelected = selectedRecord?.id === record.id;
              return (
                <div
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                      : 'bg-navy-900/60 border-slate-800/80 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-200 truncate max-w-[170px]">
                      {record.title}
                    </h3>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20" dir="ltr">
                      {record.language}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
                    {record.text}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono" dir="ltr">
                    <span>{record.wordCount} words</span>
                    <span>{record.durationSecs.toFixed(0)}s</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Detailed Record View */}
        <div className="md:col-span-2">
          {selectedRecord ? (
            <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{selectedRecord.title}</h3>
                  <div className="flex items-center space-x-3 space-x-reverse text-xs text-slate-500 mt-1">
                    <span className="flex items-center space-x-1 space-x-reverse">
                      <Calendar className="w-3 h-3 text-cyan-400" />
                      <span>{selectedRecord.createdAt}</span>
                    </span>
                    <span className="flex items-center space-x-1 space-x-reverse">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span dir="ltr">{selectedRecord.durationSecs.toFixed(1)}s</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <button
                    onClick={() => handleCopy(selectedRecord.id, selectedRecord.text)}
                    className="flex items-center space-x-1 space-x-reverse px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors shadow-sm"
                  >
                    {copiedId === selectedRecord.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === selectedRecord.id ? t('copied') : t('copyText')}</span>
                  </button>

                  {selectedRecord.srtContent && (
                    <button
                      onClick={() =>
                        exportAsFile(selectedRecord.srtContent!, `${selectedRecord.title}.srt`)
                      }
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-sm"
                      title="Download SRT"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(selectedRecord.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title={t('deleteItem')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Text Area */}
              <div className="bg-navy-950/70 p-5 rounded-xl text-slate-100 text-sm leading-relaxed max-h-96 overflow-y-auto select-text font-sans shadow-inner">
                {selectedRecord.text}
              </div>

              {/* SRT Preview (if available) */}
              {selectedRecord.srtContent && (
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 font-semibold">{t('srtPreview')}</span>
                  <pre className="bg-navy-950/60 p-3 rounded-xl text-xs text-cyan-300/80 font-mono max-h-40 overflow-y-auto shadow-inner" dir="ltr">
                    {selectedRecord.srtContent}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-navy-900/40 border border-slate-800/60 rounded-2xl p-12 text-center text-slate-500 text-xs h-full flex flex-col items-center justify-center">
              {t('selectHistoryItem')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
