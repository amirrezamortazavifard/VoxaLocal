import { WordItem } from '../types/asr';

/**
 * Normalizes text for word comparison (trims spaces and strips zero-width chars).
 */
function normalizeForComparison(text: string): string {
  return text.trim().replace(/[\u200C\u200B\uFEFF]/g, '');
}

/**
 * Merges newly committed words into the existing committed transcript,
 * ensuring no duplicate words, overlapping time slices, or repeated sentences are appended.
 */
export function mergeCommittedWords(existing: WordItem[], incoming: WordItem[]): WordItem[] {
  if (!incoming || incoming.length === 0) return existing;
  if (!existing || existing.length === 0) return incoming;

  const lastExistingEnd = existing[existing.length - 1].end;

  // 1. Sentence-level exact duplicate suffix check
  const incomingTexts = incoming.map((w) => normalizeForComparison(w.text)).join(' ');
  const existingTexts = existing.map((w) => normalizeForComparison(w.text)).join(' ');

  if (existingTexts.endsWith(incomingTexts)) {
    const lastIncoming = incoming[incoming.length - 1];
    // If incoming overlaps or repeats existing end within 0.5s or exact match, ignore completely
    if (Math.abs(lastExistingEnd - lastIncoming.end) < 0.5 || incoming[0].start < lastExistingEnd - 0.1) {
      return existing;
    }
  }

  // 2. Filter incoming words that overlap with existing committed words
  const filteredIncoming = incoming.filter((newWord) => {
    // Drop if start timestamp is before existing last word end minus tolerance
    if (newWord.start < lastExistingEnd - 0.05) {
      return false;
    }

    return !existing.some((existingWord) => {
      // Same timestamp range (within jitter)
      const isSameTime =
        Math.abs(existingWord.start - newWord.start) < 0.15 &&
        Math.abs(existingWord.end - newWord.end) < 0.15;

      // Same text within approx time
      const isSameTextAndApproxTime =
        normalizeForComparison(existingWord.text) === normalizeForComparison(newWord.text) &&
        Math.abs(existingWord.start - newWord.start) < 0.35;

      return isSameTime || isSameTextAndApproxTime;
    });
  });

  if (filteredIncoming.length === 0) {
    return existing;
  }

  return [...existing, ...filteredIncoming];
}

/**
 * Filters out uncommitted open/tail words that overlap in time or match text
 * of words that have already been finalized.
 */
export function filterUncommittedWords(
  words: WordItem[],
  committed: WordItem[],
  existingPrefix: WordItem[] = []
): WordItem[] {
  if (!words || words.length === 0) return [];
  if (committed.length === 0 && existingPrefix.length === 0) return words;

  const lastCommittedEnd = committed.length > 0 ? committed[committed.length - 1].end : -1;

  return words.filter((w) => {
    // Drop if before last committed end timestamp
    if (lastCommittedEnd >= 0 && w.start < lastCommittedEnd - 0.05) {
      return false;
    }

    const normW = normalizeForComparison(w.text);

    // Drop if matches or overlaps committed words
    const inCommitted = committed.some(
      (cw) =>
        (Math.abs(cw.start - w.start) < 0.15 && Math.abs(cw.end - w.end) < 0.15) ||
        (normalizeForComparison(cw.text) === normW && Math.abs(cw.start - w.start) < 0.35)
    );
    if (inCommitted) return false;

    // Drop if matches or overlaps prefix words
    const inPrefix = existingPrefix.some(
      (pw) =>
        (Math.abs(pw.start - w.start) < 0.15 && Math.abs(pw.end - w.end) < 0.15) ||
        (normalizeForComparison(pw.text) === normW && Math.abs(pw.start - w.start) < 0.35)
    );
    return !inPrefix;
  });
}

/**
 * Removes consecutive duplicate sentences or identical phrases caused by
 * ASR engine re-decoding loops or silence restarts.
 * E.g. "سیب‌زمینی آبپز شده. سیب‌زمینی آبپز شده." -> "سیب‌زمینی آبپز شده."
 */
export function deduplicateConsecutiveSentences(text: string): string {
  if (!text || text.trim().length === 0) return text;

  // Split text into punctuation-delimited sentences or chunks while preserving separators
  const parts = text.split(/([.!؟?\n]+)/);
  if (parts.length <= 1) {
    return text;
  }

  const resultSegments: string[] = [];
  let lastSentenceNormalized = '';

  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const separator = parts[i + 1] || '';
    const norm = normalizeForComparison(sentence);

    if (norm.length > 0) {
      if (norm !== lastSentenceNormalized) {
        resultSegments.push(sentence + separator);
        lastSentenceNormalized = norm;
      } else {
        // Repeated consecutive sentence! Skip it, but preserve newline if any
        if (separator.includes('\n')) {
          resultSegments.push('\n');
        }
      }
    } else if (separator.length > 0) {
      resultSegments.push(separator);
    }
  }

  return resultSegments.join('').trim();
}
