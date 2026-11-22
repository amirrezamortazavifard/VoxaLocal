import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileAudio, UploadCloud, Play, CheckCircle2, AlertCircle, Copy, Download, Save } from 'lucide-react';
import { FileTranscriptionResult } from '../types/asr';
import { exportAsFile } from '../utils/exportFormats';
import { useLanguage } from '../i18n/LanguageContext';

interface FileTranscriptionProps {
  onSaveToHistory: (title: string, text: string, srt: string) => Promise<void>;
  isModelLoaded: boolean;
}

export const FileTranscription: React.FC<FileTranscriptionProps> = ({
  onSaveToHistory,
  isModelLoaded,
}) => {
  const { t, language } = useLanguage();
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
      setError(language === 'fa' ? 'لطفاً ابتدا یک فایل صوتی انتخاب کنید.' : 'Please select an audio file first.');
      return;
    }
    if (!isModelLoaded) {
      setError(language === 'fa' ? 'مدل هنوز در حافظه RAM بارگذاری نشده است. لطفاً ابتدا در تب مدیریت مدل‌ها آن را بارگذاری کنید.' : 'Model is not loaded in RAM. Please load models in the Model Manager tab.');
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
      setError(String(err));
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
      const title = `${fileName}`;
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
      <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center space-x-3 space-x-reverse mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <FileAudio className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">{t('fileTransTitle')}</h2>
            <p className="text-xs text-slate-400">
              {t('fileTransSubtitle')}
            </p>
          </div>
        </div>

        {/* Dropzone container */}
        <div
          onClick={handleSelectFile}
          className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-navy-950/70 hover:bg-navy-950/90 p-8 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center text-center mt-4 shadow-inner"
        >
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3 shadow-lg shadow-cyan-500/10">
            <UploadCloud className="w-6 h-6 text-cyan-400" />
          </div>
          {fileName ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-cyan-300 font-mono" dir="ltr">{fileName}</p>
              <p className="text-xs text-slate-500" dir="ltr">{filePath}</p>
              <span className="inline-block mt-2 text-[11px] text-cyan-400 underline">{t('changeFile')}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-200">{t('dropzoneTitle')}</p>
              <p className="text-xs text-slate-500">{t('dropzoneSubtitle')}</p>
            </div>
          )}
        </div>

        {/* Settings Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-800">
          <div>
            <label className="text-xs text-slate-400 block mb-1">{t('transcriptionLang')}</label>
            <select
              value={languageMode}
              onChange={(e) => setLanguageMode(e.target.value as any)}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="fa">{t('langPersian')}</option>
              <option value="en">{t('langEnglish')}</option>
              <option value="fa,en">{t('langBoth')}</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">{t('beamWidthLabel')}</label>
            <select
              value={beamWidth}
              onChange={(e) => setBeamWidth(Number(e.target.value))}
              className="w-full bg-navy-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
            >
              <option value={1}>{t('beamGreedy')}</option>
              <option value={2}>{t('beamFast')}</option>
              <option value={4}>{t('beamDefault')}</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleStartTranscribe}
              disabled={isProcessing || !filePath}
              className="w-full flex items-center justify-center space-x-2 space-x-reverse px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 disabled:opacity-40 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isProcessing ? t('transcribingFile') : t('startFileTranscribe')}</span>
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
        <div className="bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-wrap gap-3">
            <div className="flex items-center space-x-4 space-x-reverse">
              <span className="text-xs text-slate-400">
                {t('fileDuration')}{' '}
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {result.durationSecs.toFixed(1)}s
                </span>
              </span>
              <span className="text-xs text-slate-400">
                {t('wordCount')}:{' '}
                <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
                  {result.words.length}
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse">
              {/* Tab Selector */}
              <div className="flex bg-navy-950 p-0.5 rounded-lg border border-slate-800 text-xs shadow-inner">
                <button
                  onClick={() => setActiveView('text')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'text' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {t('fullTextTab')}
                </button>
                <button
                  onClick={() => setActiveView('timestamps')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'timestamps' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {t('timestampsTab')}
                </button>
                <button
                  onClick={() => setActiveView('srt')}
                  className={`px-3 py-1 rounded transition-colors ${
                    activeView === 'srt' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {t('srtTab')}
                </button>
              </div>

              {/* Copy */}
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors shadow-sm"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('copied') : t('copyText')}</span>
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                className="flex items-center space-x-1 space-x-reverse px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 transition-colors shadow-sm"
              >
                {saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saved ? t('saved') : t('saveToHistory')}</span>
              </button>

              {/* Export SRT */}
              <button
                onClick={() => exportAsFile(result.srtContent, `${fileName}.srt`)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-sm"
                title="Download SRT"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View Mode Contents */}
          {activeView === 'text' && (
            <div className="p-4 bg-navy-950/70 rounded-xl text-base text-slate-100 leading-relaxed max-h-96 overflow-y-auto select-text font-sans shadow-inner">
              {result.text}
            </div>
          )}

          {activeView === 'timestamps' && (
            <div className="p-3 bg-navy-950/70 rounded-xl max-h-96 overflow-y-auto font-mono text-xs text-slate-300 shadow-inner">
              <div className="grid grid-cols-4 gap-2 pb-2 mb-2 border-b border-slate-800 text-slate-500 font-sans">
                <span>{t('wordCol')}</span>
                <span>{t('startCol')}</span>
                <span>{t('endCol')}</span>
                <span>{t('durationCol')}</span>
              </div>
              {result.words.map((w, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 py-1 border-b border-slate-800/40 hover:bg-slate-800/30" dir="ltr">
                  <span className="font-sans text-slate-200">{w.text}</span>
                  <span className="text-cyan-400">{w.start.toFixed(2)}s</span>
                  <span className="text-cyan-400">{w.end.toFixed(2)}s</span>
                  <span className="text-slate-400">{(w.end - w.start).toFixed(2)}s</span>
                </div>
              ))}
            </div>
          )}

          {activeView === 'srt' && (
            <pre className="p-4 bg-navy-950/70 rounded-xl text-xs text-cyan-300/90 font-mono max-h-96 overflow-y-auto select-text leading-relaxed shadow-inner" dir="ltr">
              {result.srtContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
