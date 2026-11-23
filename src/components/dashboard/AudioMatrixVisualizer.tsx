import React, { useMemo } from 'react';
import { AudioLevelPayload } from '../../types/asr';

interface AudioMatrixVisualizerProps {
  level: AudioLevelPayload;
  isTesting?: boolean;
}

export const AudioMatrixVisualizer: React.FC<AudioMatrixVisualizerProps> = ({
  level,
  isTesting = false,
}) => {
  const columnsCount = 34;
  const rowsCount = 14;

  // Calculate normalized volume (0.0 to 1.0)
  const rms = isTesting ? Math.max(level.rms, 0.25) : level.rms;
  const clampedDb = Math.max(-60, Math.min(0, level.db));
  const normalizedLevel = level.isSpeech || isTesting
    ? Math.min(1.0, Math.max(0.15, (clampedDb + 60) / 60 + rms * 0.5))
    : 0.08;

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
          // Dynamic height variation across columns with sine jitter
          const dynamicRatio = Math.min(
            1.0,
            normalizedLevel * (0.8 + 0.35 * Math.sin(colIdx * 0.5 + Date.now() / 300))
          );
          const activeRows = Math.round(maxRowsForCol * dynamicRatio);

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
