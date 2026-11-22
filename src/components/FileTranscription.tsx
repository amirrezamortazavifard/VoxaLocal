import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileAudio, UploadCloud, Play, CheckCircle2, AlertCircle, Copy, Download, Save } from 'lucide-react';
import { FileTranscriptionResult } from '../types/asr';
import { exportAsFile } from '../utils/exportFormats';

interface FileTranscriptionProps {
  onSaveToHistory: (title: string, text: string, srt: string) => Promise<void>;
  isModelLoaded: boolean;
}

export const FileTranscription: React.FC<FileTranscriptionProps> = ({
  onSaveToHistory,
  isModelLoaded,
}) => {
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [languageMode, setLanguageMode] = useState<'fa' | 'en' | 'fa,en'>('fa');
  const [beamWidth, setBeamWidth] = useState<number>(4);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<FileTranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeView, setActiveView] = useState<'text' | 'timestamps' | 'srt'>('text');

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg'] }],
      });
      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        const name = selected.split(/[\\/]/).pop() || selected;
        setFileName(name);
        setResult(null);
        setError(null);
      }
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };

  const handleStartTranscribe = async () => {
    if (!filePath) {
      setError('لطفاً ابتدا یک فایل صوتی انتخاب کنید.');
      return;
    }
    if (!isModelLoaded) {
      setError('مدل هنوز در حافظه RAM بارگذاری نشده است. لطفاً ابتدا از تب «مدیریت مدل‌ها» مدل را بارگذاری کنید.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const res = await invoke<FileTranscriptionResult>('transcribe_audio_file', {
        filePath,
        languageMode,
        beamWidth,
      });
      setResult(res);
    } catch (err: any) {
      setError(`خطا در رونویسی فایل: ${String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const title = `رونویسی فایل: ${fileName}`;
      await onSaveToHistory(title, result.text, result.srtContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* File Upload / Picker Card */}
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex items-center space-x-3 space-x-reverse mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <FileAudio className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">رونویسی فایل صوتی آفلاین (File Transcription)</h2>
            <p className="text-xs text-slate-400">
              تبدیل دقیق صوت ضبط‌شده به متن کامل با الگوریتم گذر کامل (Full-Context Pass) و تفکیک برچسب‌های زمانی کلمات
            </p>
          </div>
        </div>

        {/* Dropzone / Picker container */}
        <div
          onClick={handleSelectFile}
          className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-navy-950/60 hover:bg-navy-950/80 p-8 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center text-center mt-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
            <UploadCloud className="w-6 h-6 text-cyan-400" />
          </div>
          {fileName ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-cyan-300 font-mono" dir="ltr">{fileName}</p>
              <p className="text-xs text-slate-500" dir="ltr">{filePath}</p>
              <span className="inline-block mt-2 text-[11px] text-cyan-400 underline">کلیک برای تغییر فایل</span>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-200">کلیک کنید تا فایل صوتی را انتخاب کنید</p>
              <p className="text-xs text-slate-500">پشتیبانی از فرمت‌های WAV، MP3، FLAC، M4A، OGG</p>
            </div>
          )}
        </div>

        {/* Settings Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-800">
          <div>
            <label className="text-xs text-slate-400 block mb-1">زبان رونویسی:</label>
            <select
              value={languageMode}
              onChange={(e) => setLanguageMode(e.target.value as any)}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="fa">فارسی (Persian)</option>
              <option value="en">انگلیسی (English)</option>
              <option value="fa,en">فارسی + انگلیسی (انتخاب خودکار)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">عرض پرتو جستجو (Beam Width):</label>
            <select
              value={beamWidth}
              onChange={(e) => setBeamWidth(Number(e.target.value))}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
            >
              <option value={1}>1 (Greedy - سریع‌ترین)</option>
              <option value={2}>2 (Fast Beam)</option>
              <option value={4}>4 (Default - بالاترین دقت)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleStartTranscribe}
              disabled={isProcessing || !filePath}
              className="w-full flex items-center justify-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 disabled:opacity-40 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isProcessing ? 'در حال رونویسی آفلاین...' : 'شروع رونویسی کامل'}</span>
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 space-x-reverse">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Transcription Result Card */}
      {result && (
        <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-4 space-x-reverse">
              <span className="text-xs text-slate-400">
                مدت فایل: <span className="font-mono text-cyan-300 font-semibold">{result.durationSecs.toFixed(1)}s</span>
              </span>
              <span className="text-xs text-slate-400">
                کلمات: <span className="font-mono text-cyan-300 font-semibold">{result.words.length}</span>
              </span>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse">
              {/* Tab Selector */}
              <div className="flex bg-navy-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveView('text')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'text' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  متن کامل
                </button>
                <button
                  onClick={() => setActiveView('timestamps')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'timestamps' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  برچسب زمانی
                </button>
                <button
                  onClick={() => setActiveView('srt')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'srt' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  زیرنویس (SRT)
                </button>
              </div>

              {/* Copy */}
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'کپی شد' : 'کپی'}</span>
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 transition-colors"
              >
                {saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saved ? 'ذخیره شد' : 'ذخیره در تاریخچه'}</span>
              </button>

              {/* Export SRT */}
              <button
                onClick={() => exportAsFile(result.srtContent, `${fileName}.srt`)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="دانلود فایل SRT"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View Mode Contents */}
          {activeView === 'text' && (
            <div className="p-4 bg-navy-950/70 rounded-xl text-base text-slate-100 leading-relaxed max-h-96 overflow-y-auto select-text font-sans">
              {result.text}
            </div>
          )}

          {activeView === 'timestamps' && (
            <div className="p-3 bg-navy-950/70 rounded-xl max-h-96 overflow-y-auto font-mono text-xs text-slate-300">
              <div className="grid grid-cols-4 gap-2 pb-2 mb-2 border-b border-slate-800 text-slate-500 font-sans">
                <span>کلمه</span>
                <span>شروع (ثانیه)</span>
                <span>پایان (ثانیه)</span>
                <span>مدت</span>
              </div>
              {result.words.map((w, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 py-1 border-b border-slate-800/40 hover:bg-slate-800/30">
                  <span className="font-sans text-slate-200">{w.text}</span>
                  <span className="text-cyan-400">{w.start.toFixed(2)}s</span>
                  <span className="text-cyan-400">{w.end.toFixed(2)}s</span>
                  <span className="text-slate-400">{(w.end - w.start).toFixed(2)}s</span>
                </div>
              ))}
            </div>
          )}

          {activeView === 'srt' && (
            <pre className="p-4 bg-navy-950/70 rounded-xl text-xs text-cyan-300/90 font-mono max-h-96 overflow-y-auto select-text leading-relaxed" dir="ltr">
              {result.srtContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
