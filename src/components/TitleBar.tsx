import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const TitleBar: React.FC = () => {
  const { language } = useLanguage();

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  };

  return (
    <header
      data-tauri-drag-region
      dir="ltr"
      className="h-9 bg-[#0e0f13] border-b border-white/[0.07] px-3 flex items-center justify-between select-none shrink-0 relative"
    >
      {/* Subtle top specular line */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent pointer-events-none" />

      {/* Left: Brand Identity */}
      <div data-tauri-drag-region className="flex items-center space-x-2 pointer-events-none">
        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 p-[1.5px] shadow shadow-cyan-500/20">
          <div className="w-full h-full bg-[#0e0f13] rounded-full flex items-center justify-center">
            <svg
              className="w-2.5 h-2.5 text-cyan-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 11v2M22 12h-2" />
            </svg>
          </div>
        </div>
        <span className="text-xs font-bold text-slate-200 tracking-wide">VoxaLocal</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.06]">
          v1.0.2
        </span>
        <span className="hidden sm:inline text-[10px] text-slate-500 font-medium">
          {language === 'fa' ? '• استودیوی بازشناسی گفتار آفلاین' : '• Offline Speech Studio'}
        </span>
      </div>

      {/* Right: Window Controls (Minimize & Close to Tray) */}
      <div className="flex items-center space-x-1">
        <button
          onClick={handleMinimize}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors cursor-pointer"
          title={language === 'fa' ? 'کوچک کردن (Minimize)' : 'Minimize'}
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/80 transition-colors cursor-pointer"
          title={language === 'fa' ? 'بستن (پنهان در سینی سیستم)' : 'Close (Hide to System Tray)'}
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
