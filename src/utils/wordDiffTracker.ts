import { TrackedWordItem, WordItem } from '../types/asr';

const REVISION_ANIMATION_DURATION_MS = 650;

/**
 * Normalizes word text for comparison, trimming whitespace and normalizing zero-width chars.
 */
function normalizeWord(text: string): string {
  return text.trim().replace(/[\u200C\u200B]/g, '');
}

/**
 * Compares consecutive provisional word snapshots to determine which words are
 * newly streamed, which words are stable, and which specific words were re-decoded
 * and modified by the second-pass beam search.
 */
export function trackProvisionalWords(
  prevTracked: TrackedWordItem[],
  newOpenWords: WordItem[],
  newTailWords: WordItem[],
  committedWords: WordItem[]
): TrackedWordItem[] {
  const now = Date.now();
  const lastCommittedEnd =
    committedWords.length > 0 ? committedWords[committedWords.length - 1].end : -1;

  // Filter uncommitted words that might overlap with committed words
  const rawProvisional = [...newOpenWords, ...newTailWords].filter(
    (w) => w.start >= lastCommittedEnd - 0.05
  );

  const prevProvisional = prevTracked.filter((w) => w.visualState !== 'committed');
  const usedPrevIndices = new Set<number>();

  const result: TrackedWordItem[] = rawProvisional.map((newWord, idx) => {
    const newNorm = normalizeWord(newWord.text);

    // Find counterpart in previous provisional hypothesis based on temporal proximity
    let bestMatchIdx = -1;
    let minTimeDiff = Infinity;

    for (let i = 0; i < prevProvisional.length; i++) {
      if (usedPrevIndices.has(i)) continue;
      const prevWord = prevProvisional[i];

      const startDiff = Math.abs(prevWord.start - newWord.start);
      const endDiff = Math.abs(prevWord.end - newWord.end);
      const totalDiff = startDiff + endDiff;

      // Temporal match tolerance (within 280ms)
      if (startDiff < 0.28 && totalDiff < minTimeDiff) {
        minTimeDiff = totalDiff;
        bestMatchIdx = i;
      }
    }

    if (bestMatchIdx !== -1) {
      usedPrevIndices.add(bestMatchIdx);
      const matchedPrev = prevProvisional[bestMatchIdx];
      const prevNorm = normalizeWord(matchedPrev.text);

      if (prevNorm === newNorm) {
        // Text is unchanged. Preserve revision state if animation is still running
        const isStillAnimating =
          matchedPrev.visualState === 'provisional-corrected' &&
          matchedPrev.lastRevisedAt &&
          now - matchedPrev.lastRevisedAt < REVISION_ANIMATION_DURATION_MS;

        return {
          ...newWord,
          id: matchedPrev.id,
          visualState: isStillAnimating ? 'provisional-corrected' : 'provisional-stable',
          lastRevisedAt: matchedPrev.lastRevisedAt,
          createdAt: matchedPrev.createdAt,
        };
      } else {
        // Word text CHANGED due to re-decoding! Trigger Telegram-style correction animation
        return {
          ...newWord,
          id: matchedPrev.id, // Stable identity preserves React DOM node for CSS animation
          visualState: 'provisional-corrected',
          lastRevisedAt: now,
          createdAt: matchedPrev.createdAt,
        };
      }
    }

    // New word produced by streaming pass
    const stableId = `prov_${Math.round(newWord.start * 100)}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
    return {
      ...newWord,
      id: stableId,
      visualState: 'provisional-new',
      createdAt: now,
    };
  });

  return result;
}

/**
 * Resets completed animations back to provisional-stable.
 */
export function pruneExpiredVisualStates(words: TrackedWordItem[]): TrackedWordItem[] {
  const now = Date.now();
  let changed = false;

  const updated = words.map((w) => {
    if (w.visualState === 'provisional-corrected') {
      if (w.lastRevisedAt && now - w.lastRevisedAt >= REVISION_ANIMATION_DURATION_MS) {
        changed = true;
        return { ...w, visualState: 'provisional-stable' as const };
      }
    } else if (w.visualState === 'provisional-new') {
      if (now - w.createdAt >= 400) {
        changed = true;
        return { ...w, visualState: 'provisional-stable' as const };
      }
    }
    return w;
  });

  return changed ? updated : words;
}
