import React from 'react';
import { Volume2 } from 'lucide-react';
import { AudioLevelPayload } from '../types/asr';
import { useLanguage } from '../i18n/LanguageContext';

interface AudioVisualizerProps {
  level: AudioLevelPayload;
  isRecording: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ level, isRecording }) => {
  const { t } = useLanguage();
  const rmsPercent = isRecording ? Math.min(100, Math.max(3, Math.round(level.rms * 280))) : 0;
  const dbDisplay = isRecording ? `${Math.round(level.db)} dB` : '-∞ dB';

  // 24 animated audio wave bars
  const bars = Array.from({ length: 24 });

  return (
    <div className="flex items-center space-x-3 space-x-reverse bg-navy-950/80 border border-slate-800/80 px-4 py-2 rounded-2xl backdrop-blur-md shadow-inner">
      <div className="flex items-center space-x-2 space-x-reverse">
        <div className={`p-1.5 rounded-lg transition-colors ${level.isSpeech ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800/40 text-slate-500'}`}>
          <Volume2 className={`w-3.5 h-3.5 ${level.isSpeech ? 'animate-pulse' : ''}`} />
        </div>
        <span className="text-xs font-mono text-slate-400 min-w-[52px]" dir="ltr">
          {dbDisplay}
        </span>
      </div>

      {/* Dynamic Waveform Bars */}
      <div className="flex items-center space-x-1 space-x-reverse h-7 w-48 px-1" dir="ltr">
        {bars.map((_, i) => {
          const centerDist = Math.abs(i - 11.5) / 12.0;
          const factor = 1.0 - centerDist * 0.45;
          const randomJitter = isRecording && level.isSpeech ? (Math.sin(i * 1.8 + Date.now() / 200) * 0.15 + 0.85) : 1;
          const barHeight = isRecording
            ? Math.max(8, Math.min(100, Math.round(rmsPercent * factor * randomJitter)))
            : 6;

          return (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-75 ${
                level.isSpeech
                  ? 'bg-gradient-to-t from-cyan-600 via-teal-400 to-cyan-200 shadow-sm shadow-cyan-400/40'
                  : isRecording
                  ? 'bg-slate-700'
                  : 'bg-slate-800/70'
              }`}
              style={{ height: `${barHeight}%` }}
            />
          );
        })}
      </div>

      {/* Speech Status Indicator */}
      <div
        className={`flex items-center space-x-1.5 space-x-reverse text-[11px] font-sans px-2.5 py-1 rounded-full border transition-all ${
          level.isSpeech
            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-medium'
            : 'bg-slate-800/40 text-slate-500 border-transparent'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            level.isSpeech ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
          }`}
        />
        <span>{level.isSpeech ? t('speechDetected') : t('silence')}</span>
      </div>
    </div>
  );
};
