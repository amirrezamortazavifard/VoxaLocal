import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowUpDown, Download, Trash2, FileText, Database, Check } from 'lucide-react';
import { TranscriptRecord } from '../../types/asr';
import { exportAsFile } from '../../utils/exportFormats';
import { useLanguage } from '../../i18n/LanguageContext';

export const ImportExportView: React.FC = () => {
  const { t, language } = useLanguage();
  const [records, setRecords] = useState<TranscriptRecord[]>([]);
  const [exportedFormat, setExportedFormat] = useState<string | null>(null);

  useEffect(() => {
    invoke<TranscriptRecord[]>('get_history')
      .then((data) => setRecords(data))
      .catch(console.error);
  }, []);

  const handleExportAll = (format: 'json' | 'txt' | 'csv') => {
    if (records.length === 0) return;

    let content = '';
    let filename = `voxalocal-history-${new Date().toISOString().slice(0, 10)}`;
    let mime = 'text/plain';

    if (format === 'json') {
      content = JSON.stringify(records, null, 2);
      filename += '.json';
      mime = 'application/json';
    } else if (format === 'csv') {
      const header = 'ID,Date,DurationSecs,WordCount,Title,Text\n';
      const rows = records.map((r) =>
        `"${r.id}","${r.createdAt}",${r.durationSecs},${r.wordCount},"${r.title.replace(/"/g, '""')}","${r.text.replace(/"/g, '""')}"`
      ).join('\n');
      content = header + rows;
      filename += '.csv';
      mime = 'text/csv';
    } else {
      content = records.map((r) => `[${r.createdAt}] (${r.title})\n${r.text}\n\n`).join('---\n\n');
      filename += '.txt';
      mime = 'text/plain';
    }

    exportAsFile(content, filename, mime);
    setExportedFormat(format.toUpperCase());
    setTimeout(() => setExportedFormat(null), 2500);
  };

  const handleClearHistory = async () => {
    if (!window.confirm(t('confirmClearHistory'))) return;
    try {
      await invoke('clear_history');
      setRecords([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5 space-x-reverse">
            <ArrowUpDown className="w-5 h-5 text-teal-400" />
            <span>{t('tabImportExport')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'fa'
              ? 'پشتیبان‌گیری از تاریخچه رونویسی‌ها، صدور داده‌ها به فرمت‌های استاندارد و مدیریت پایگاه‌داده.'
              : 'Export transcripts, backup local SQLite history, and manage persistent records.'}
          </p>
        </div>

        {exportedFormat && (
          <span className="flex items-center space-x-1.5 space-x-reverse text-xs text-emerald-400 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>Exported {exportedFormat}!</span>
          </span>
        )}
      </div>

      {/* Database Overview Card */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center space-x-3.5 space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
            <Database className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {language === 'fa' ? 'پایگاه‌داده محلی SQLite' : 'Local SQLite Storage'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === 'fa'
                ? `${records.length} رونویسی در پایگاه‌داده محلی ذخیره شده است.`
                : `${records.length} transcripts currently saved locally on disk.`}
            </p>
          </div>
        </div>

        {records.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="flex items-center space-x-1.5 space-x-reverse px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('clearAllHistory')}</span>
          </button>
        )}
      </div>

      {/* Export Options Grid */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {language === 'fa' ? 'صدور داده‌ها (Export)' : 'Export Transcripts'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* JSON Export */}
          <button
            onClick={() => handleExportAll('json')}
            disabled={records.length === 0}
            className="flex flex-col items-center justify-center p-5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-6 h-6 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">JSON Archive</span>
            <span className="text-[10px] text-slate-400 mt-1">Full database records</span>
          </button>

          {/* TXT Export */}
          <button
            onClick={() => handleExportAll('txt')}
            disabled={records.length === 0}
            className="flex flex-col items-center justify-center p-5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">Plain Text (TXT)</span>
            <span className="text-[10px] text-slate-400 mt-1">Readable transcript list</span>
          </button>

          {/* CSV Export */}
          <button
            onClick={() => handleExportAll('csv')}
            disabled={records.length === 0}
            className="flex flex-col items-center justify-center p-5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowUpDown className="w-6 h-6 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">Spreadsheet (CSV)</span>
            <span className="text-[10px] text-slate-400 mt-1">Excel & Sheets compatible</span>
          </button>
        </div>
      </div>
    </div>
  );
};
