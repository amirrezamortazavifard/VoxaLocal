import React, { useMemo, useState, useEffect } from 'react';
import { AudioLevelPayload } from '../../types/asr';

interface AudioMatrixVisualizerProps {
  level: AudioLevelPayload;
  isTesting?: boolean;
  isRecording?: boolean;
}

export const AudioMatrixVisualizer: React.FC<AudioMatrixVisualizerProps> = ({
  level,
  isTesting = false,
  isRecording = false,
}) => {
  const columnsCount = 34;
  const rowsCount = 14;
  const [tick, setTick] = useState(0);

  // Animation ticker for fluid waves when audio is active or testing/recording
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => (prev + 1) % 10000);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Calculate normalized volume with logarithmic dB + linear RMS
  const dbNorm = Math.max(0, Math.min(1.0, (level.db + 58.0) / 45.0));
  const rmsNorm = Math.min(1.0, level.rms * 35.0);
  const speechEnergy = isTesting ? 0.65 : Math.max(dbNorm, rmsNorm);
  const isSpeech = level.isSpeech || speechEnergy > 0.08 || level.rms > 0.0025 || isTesting;
  const normalizedLevel = isSpeech
    ? Math.min(1.0, Math.max(0.18, speechEnergy))
    : (isRecording ? 0.1 : 0.05);

  // Precompute column peak heights for diamond/hexagon profile
  const columnMaxHeights = useMemo(() => {
    return Array.from({ length: columnsCount }, (_, colIdx) => {
      const centerDist = Math.abs(colIdx - (columnsCount - 1) / 2) / ((columnsCount - 1) / 2);
      // Diamond profile: 1.0 at center, down to ~0.35 at edges
      const shapeFactor = 1.0 - Math.pow(centerDist, 1.4) * 0.65;
      return Math.round(rowsCount * shapeFactor);
    });
  }, [columnsCount, rowsCount]);

  return (
    <div className="w-full flex flex-col items-center justify-center p-3">
      {/* LED Grid Container */}
      <div
        className="flex items-center justify-center gap-[3px] h-32 w-full max-w-xl px-2 py-1 select-none"
        dir="ltr"
      >
        {columnMaxHeights.map((maxRowsForCol, colIdx) => {
          // Dynamic height variation across columns with sine waves
          const wavePhase = Math.sin(colIdx * 0.45 + tick * 0.25) * 0.35 + 0.65;
          const dynamicRatio = isSpeech
            ? Math.min(1.0, normalizedLevel * wavePhase)
            : Math.max(0.06, (Math.sin(colIdx * 0.3 + tick * 0.08) * 0.03 + 0.07));
          const activeRows = Math.max(1, Math.round(maxRowsForCol * dynamicRatio));

          return (
            <div
              key={colIdx}
              className="flex flex-col-reverse justify-center gap-[3px] h-full"
              style={{
                height: `${(maxRowsForCol / rowsCount) * 100}%`,
              }}
            >
              {Array.from({ length: maxRowsForCol }).map((_, rowIdx) => {
                const isActive = rowIdx < activeRows;
                const rowFraction = rowIdx / rowsCount;

                // Color gradient based on row height:
                // Bottom: Indigo/Purple -> Middle: Ocean Blue -> Top: Bright Cyan/Teal
                let activeColor = 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]';
                if (rowFraction < 0.4) {
                  activeColor = 'bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.5)]';
                } else if (rowFraction < 0.75) {
                  activeColor = 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.6)]';
                }

                return (
                  <div
                    key={rowIdx}
                    className={`w-2.5 h-1.5 rounded-[1.5px] transition-all duration-75 ${
                      isActive
                        ? activeColor
                        : 'bg-[#1e2330] border border-white/[0.04]'
                    }`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
