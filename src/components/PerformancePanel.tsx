import React from 'react';
import { Activity, Cpu, Layers } from 'lucide-react';
import { RecognitionSettings } from '../types/asr';

interface PerformancePanelProps {
  settings: RecognitionSettings;
  status: string;
  eouProb: number | null;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({
  settings,
  status,
  eouProb,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-navy-950/80 border border-slate-800/80 p-3 rounded-xl text-xs backdrop-blur-md">
      <div className="flex items-center space-x-2 space-x-reverse">
        <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="text-[10px] text-slate-500 block">وضعیت موتور:</span>
          <span className="font-semibold text-slate-200">
            {status === 'recording'
              ? 'در حال استریم زنده'
              : status === 'processing'
              ? 'در حال نهایی‌سازی'
              : 'آماده (Idle)'}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 space-x-reverse">
        <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="text-[10px] text-slate-500 block">نخ‌های پردازش (Threads):</span>
          <span className="font-mono text-cyan-300 font-semibold">{settings.threads} Core</span>
        </div>
      </div>

      <div className="flex items-center space-x-2 space-x-reverse">
        <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="text-[10px] text-slate-500 block">عرض پرتو (Beam):</span>
          <span className="font-mono text-cyan-300 font-semibold">{settings.beamWidth}</span>
        </div>
      </div>

      <div className="flex items-center space-x-2 space-x-reverse">
        <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0"></div>
        <div>
          <span className="text-[10px] text-slate-500 block">تشخیص پایان نوبت (EOU):</span>
          <span className="font-mono text-slate-200">
            {eouProb !== null ? `${(eouProb * 100).toFixed(0)}%` : '---'}
          </span>
        </div>
      </div>
    </div>
  );
};
