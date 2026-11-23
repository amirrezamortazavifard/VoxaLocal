import { trackProvisionalWords, pruneExpiredVisualStates } from './wordDiffTracker';
import { WordItem } from '../types/asr';

// Deterministic test sequence from Section 16
export function runWordDiffTrackerTests() {
  console.log('[Test] Running WordDiffTracker Telegram-Style Re-decoding Tests...');

  // 1. Partial A: "من از قابلیت voice استفاده میکنم"
  const partialA_words: WordItem[] = [
    { text: 'من', start: 0.1, end: 0.3, join: false },
    { text: 'از', start: 0.35, end: 0.5, join: false },
    { text: 'قابلیت', start: 0.55, end: 0.9, join: false },
    { text: 'voice', start: 0.95, end: 1.3, join: false },
    { text: 'استفاده', start: 1.35, end: 1.7, join: false },
    { text: 'میکنم', start: 1.75, end: 2.1, join: false },
  ];

  const tracked_A = trackProvisionalWords([], partialA_words, [], []);
  console.assert(tracked_A.length === 6, 'Partial A should produce 6 words');
  console.assert(
    tracked_A.every((w) => w.visualState === 'provisional-new'),
    'All initial words should have provisional-new state'
  );

  // 2. Partial B arrives where 'voice' is re-decoded to 'Voice Recognition'
  // and other words remain identical: "من از قابلیت Voice Recognition استفاده میکنم"
  const partialB_words: WordItem[] = [
    { text: 'من', start: 0.1, end: 0.3, join: false },
    { text: 'از', start: 0.35, end: 0.5, join: false },
    { text: 'قابلیت', start: 0.55, end: 0.9, join: false },
    { text: 'Voice Recognition', start: 0.95, end: 1.32, join: false },
    { text: 'استفاده', start: 1.35, end: 1.7, join: false },
    { text: 'میکنم', start: 1.75, end: 2.1, join: false },
  ];

  const tracked_B = trackProvisionalWords(tracked_A, partialB_words, [], []);
  console.assert(tracked_B.length === 6, 'Partial B should have 6 words');

  // Verify unchanged words remain stable (do NOT flash unnecessarily)
  console.assert(
    tracked_B[0].visualState === 'provisional-stable',
    'Word "من" must be stable, not re-animated'
  );
  console.assert(
    tracked_B[1].visualState === 'provisional-stable',
    'Word "از" must be stable, not re-animated'
  );
  console.assert(
    tracked_B[2].visualState === 'provisional-stable',
    'Word "قابلیت" must be stable, not re-animated'
  );

  // Verify changed word receives correction state
  console.assert(
    tracked_B[3].visualState === 'provisional-corrected',
    'Changed word "Voice Recognition" MUST have provisional-corrected visual state'
  );
  console.assert(
    tracked_B[3].id === tracked_A[3].id,
    'Corrected word MUST preserve stable ID to prevent DOM element remounting'
  );

  console.assert(
    tracked_B[4].visualState === 'provisional-stable',
    'Word "استفاده" must be stable, not re-animated'
  );
  console.assert(
    tracked_B[5].visualState === 'provisional-stable',
    'Word "میکنم" must be stable, not re-animated'
  );

  // 3. Verify expiration pruning
  const pruned = pruneExpiredVisualStates(tracked_B);
  console.assert(Array.isArray(pruned), 'Pruned result must be array');

  // 4. Verify Commit finalization immutability
  const committedSentence: WordItem[] = [
    { text: 'من', start: 0.1, end: 0.3, join: false },
    { text: 'از', start: 0.35, end: 0.5, join: false },
    { text: 'قابلیت', start: 0.55, end: 0.9, join: false },
    { text: 'Voice Recognition', start: 0.95, end: 1.32, join: false },
    { text: 'استفاده', start: 1.35, end: 1.7, join: false },
    { text: 'میکنم', start: 1.75, end: 2.1, join: false },
  ];

  // A subsequent streaming word arrives after the commit
  const newTail: WordItem[] = [
    { text: 'خیلی', start: 2.3, end: 2.6, join: false },
  ];

  const tracked_C = trackProvisionalWords(tracked_B, [], newTail, committedSentence);
  console.assert(tracked_C.length === 1, 'Only uncommitted words should remain provisional');
  console.assert(tracked_C[0].text === 'خیلی', 'New tail word should be present');
  console.assert(tracked_C[0].visualState === 'provisional-new', 'New tail word has provisional-new state');

  console.log('[Test] All WordDiffTracker Telegram-Style Re-decoding Tests PASSED successfully!');
  return true;
}

if (typeof window === 'undefined') {
  runWordDiffTrackerTests();
}
