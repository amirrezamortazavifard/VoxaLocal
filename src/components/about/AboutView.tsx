import React from 'react';
import { ShieldCheck, Cpu, ExternalLink, Code2 } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLanguage } from '../../i18n/LanguageContext';

export const AboutView: React.FC = () => {
  const { language } = useLanguage();

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch (err) {
      console.error('Failed to open link:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto space-y-6 font-sans select-none text-slate-200">
      {/* Brand Header */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-8 shadow-xl flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6 md:space-x-reverse text-center md:text-start">
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 p-[3px] shadow-xl shadow-cyan-500/20 shrink-0">
          <div className="w-full h-full bg-[#141518] rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 11v2M22 12h-2" />
            </svg>
          </div>
        </div>

        <div className="space-y-1.5 flex-1">
          <div className="flex items-center justify-center md:justify-start space-x-2.5 space-x-reverse">
            <h2 className="text-2xl font-bold text-white">VoxaLocal</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-mono font-semibold" dir="ltr">
              v0.1.0 Offline
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {language === 'fa'
              ? 'استودیوی حرفه‌ای دیکته و بازشناسی گفتار آفلاین فارسی و انگلیسی با موتور بومی TinyASR و Silero VAD.'
              : 'Professional, private, offline Persian & English speech recognition and global dictation powered by TinyASR.'}
          </p>
        </div>
      </div>

      {/* Offline & Privacy Guarantee Card */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-2.5 space-x-reverse text-white text-sm font-bold">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>{language === 'fa' ? 'تضمین حریم خصوصی و عملکرد ۱۰۰٪ آفلاین' : '100% Offline & Privacy Guarantee'}</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {language === 'fa'
            ? 'نرم‌افزار VoxaLocal هیچ‌گونه داده صوتی، متنی یا رفتار کاربری را به اینترنت ارسال نمی‌کند. تمام فرآیندهای یادگیری ماشین، بازگشایی شبکه عصبی RNN-T/TDT و پردازش VAD مستقیماً روی پردازنده سیستم شما (CPU) به صورت محلی انجام می‌پذیرد.'
            : 'VoxaLocal contains zero network telemetry, zero tracking, and zero remote API calls. All neural network inference (RNN-T / TDT Zipformer2) and Voice Activity Detection (Silero VAD) runs entirely on your local machine.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl">
            <p className="text-xs font-semibold text-cyan-400">{language === 'fa' ? 'بدون اینترنت' : 'Zero Cloud'}</p>
            <p className="text-[11px] text-slate-400 mt-1">{language === 'fa' ? 'عملکرد کامل بدون نیاز به اتصال شبکه' : 'Operates with zero internet connectivity.'}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl">
            <p className="text-xs font-semibold text-emerald-400">{language === 'fa' ? 'پایگاه‌داده محلی' : 'Local SQLite'}</p>
            <p className="text-[11px] text-slate-400 mt-1">{language === 'fa' ? 'ذخیره تاریخچه فقط روی دیسک کامپیوتر شما' : 'History is stored exclusively in your AppData.'}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl">
            <p className="text-xs font-semibold text-purple-400">{language === 'fa' ? 'متن‌باز و قابل بازرسی' : 'Open Source'}</p>
            <p className="text-[11px] text-slate-400 mt-1">{language === 'fa' ? 'کد منبع کاملاً شفاف و قابل حسابرسی' : 'Auditable source code under GPL-3.0.'}</p>
          </div>
        </div>
      </div>

      {/* Technical Specifications */}
      <div className="bg-[#18191d] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center space-x-2.5 space-x-reverse text-white text-sm font-bold">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <span>{language === 'fa' ? 'مشخصات فنی و موتور بازشناسی' : 'Engine & Architectural Stack'}</span>
        </div>

        <ul className="text-xs text-slate-400 space-y-2 ps-4 list-disc">
          <li>
            <strong className="text-slate-200">TinyASR Engine:</strong> Zipformer2 dual-language (Persian & English) ~60M parameter neural network with int4 quantized weights and AVX2/AVX-512 SIMD kernels.
          </li>
          <li>
            <strong className="text-slate-200">Silero VAD v5:</strong> High-precision neural Voice Activity Detection running at 16,000 Hz for sub-50ms speech endpointing.
          </li>
          <li>
            <strong className="text-slate-200">Frontend / Framework:</strong> Tauri 2.12 + Rust 2021 + React 18 + Vite 6 + Tailwind CSS.
          </li>
        </ul>
      </div>

      {/* External Links */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => handleOpenLink('https://github.com/amirrezamortazavifard/VoxaLocal')}
          className="flex items-center space-x-1.5 space-x-reverse text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
        >
          <Code2 className="w-4 h-4" />
          <span>GitHub Repository</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <span className="text-[11px] text-slate-500 font-mono">
          GNU General Public License v3.0
        </span>
      </div>
    </div>
  );
};
