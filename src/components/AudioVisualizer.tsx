import React from 'react';
import { Volume2 } from 'lucide-react';
import { AudioLevelPayload } from '../types/asr';

interface AudioVisualizerProps {
  level: AudioLevelPayload;
  isRecording: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ level, isRecording }) => {
  // Normalize rms (0.0 to ~0.5) to percentage
  const rmsPercent = isRecording ? Math.min(100, Math.max(2, Math.round(level.rms * 250))) : 0;
  const dbDisplay = isRecording ? `${Math.round(level.db)} dB` : '-∞ dB';

  // 16 animated waveform bars
  const bars = Array.from({ length: 16 });

  return (
    <div className="flex items-center space-x-4 space-x-reverse bg-navy-950/60 border border-slate-800/80 px-4 py-2 rounded-xl backdrop-blur-sm">
      <div className="flex items-center space-x-2 space-x-reverse">
        <Volume2 className={`w-4 h-4 ${level.isSpeech ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
        <span className="text-xs font-mono text-slate-400 min-w-[50px] text-left" dir="ltr">
          {dbDisplay}
        </span>
      </div>

      {/* Waveform bars */}
      <div className="flex items-end space-x-1 space-x-reverse h-6 w-44">
        {bars.map((_, i) => {
          // Calculate dynamic height with slight frequency wave spread
          const centerDist = Math.abs(i - 7.5) / 8.0;
          const factor = 1.0 - centerDist * 0.5;
          const barHeight = isRecording
            ? Math.max(10, Math.min(100, Math.round(rmsPercent * factor * (0.8 + Math.sin(i * 1.5) * 0.2))))
            : 8;

          return (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                level.isSpeech
                  ? 'bg-gradient-to-t from-cyan-600 to-cyan-300'
                  : isRecording
                  ? 'bg-slate-700'
                  : 'bg-slate-800/60'
              }`}
              style={{ height: `${barHeight}%` }}
            />
          );
        })}
      </div>

      {/* VAD Speech indicator pill */}
      <div
        className={`text-[11px] font-sans px-2 py-0.5 rounded-md border transition-all ${
          level.isSpeech
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
            : 'bg-slate-800/40 text-slate-500 border-transparent'
        }`}
      >
        {level.isSpeech ? 'گفتار تشخیص داده شد' : 'سکوت'}
      </div>
    </div>
  );
};
