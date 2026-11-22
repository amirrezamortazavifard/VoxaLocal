import React from 'react';
import { Activity, Cpu, Layers } from 'lucide-react';
import { RecognitionSettings } from '../types/asr';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-navy-950/85 border border-slate-800/80 p-3.5 rounded-2xl text-xs backdrop-blur-md shadow-lg">
      <div className="flex items-center space-x-2.5 space-x-reverse">
        <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="text-[10px] text-slate-500 block">{t('engineStatus')}</span>
          <span className="font-semibold text-slate-200">
            {status === 'recording'
              ? t('statusStreaming')
              : status === 'processing'
              ? t('statusFinalizing')
              : t('statusIdle')}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2.5 space-x-reverse">
        <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="text-[10px] text-slate-500 block">{t('cpuThreads')}</span>
          <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
            {settings.threads} Cores
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2.5 space-x-reverse">
        <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="text-[10px] text-slate-500 block">{t('beamWidth')}</span>
          <span className="font-mono text-cyan-300 font-semibold" dir="ltr">
            {settings.beamWidth}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2.5 space-x-reverse">
        <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 shadow-sm shadow-cyan-400/50"></div>
        <div>
          <span className="text-[10px] text-slate-500 block">{t('eouProb')}</span>
          <span className="font-mono text-slate-200" dir="ltr">
            {eouProb !== null ? `${(eouProb * 100).toFixed(0)}%` : '---'}
          </span>
        </div>
      </div>
    </div>
  );
};
