/**
 * Persian typography and orthography normalization utilities.
 * Purely client-side, non-destructive, and optional.
 */

export function normalizePersianLetters(text: string): string {
  if (!text) return '';

  return text
    // Replace Arabic Kaf with Persian Keheh
    .replace(/\u0643/g, '\u06a9')
    // Replace Arabic Yeh variants with Persian Yeh
    .replace(/[\u0649\u064a\u06cd\u06ce]/g, '\u06cc')
    // Replace Arabic Heh with Yeh above
    .replace(/\u06c0/g, '\u0647\u0654')
    // Normalize Arabic tatweel / kashida
    .replace(/\u0640/g, '')
    // Normalize various space characters to standard space
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f]/g, ' ')
    // Remove duplicate consecutive spaces
    .replace(/ {2,}/g, ' ');
}

export function applyPersianZwnj(text: string): string {
  if (!text) return '';

  const ZWNJ = '\u200c';

  return text
    // Verb prefixes: می and نمی
    .replace(/\b(ن?می)\s+/g, `$1${ZWNJ}`)
    // Plural suffix: ها and های
    .replace(/\s+(ها|های|هایی)\b/g, `${ZWNJ}$1`)
    // Comparative suffixes: تر and ترین
    .replace(/\s+(تر|ترین)\b/g, `${ZWNJ}$1`)
    // Possessive and pronominal enclitics when isolated
    .replace(/\s+(ام|ات|اش|مان|تان|شان)\b/g, `${ZWNJ}$1`)
    // Cleanup any double ZWNJ or spaces around ZWNJ
    .replace(/\u200c{2,}/g, ZWNJ)
    .replace(/\s+\u200c/g, ZWNJ)
    .replace(/\u200c\s+/g, ZWNJ);
}

export function toPersianDigits(text: string): string {
  if (!text) return '';
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return text.replace(/[0-9]/g, (digit) => persianDigits[parseInt(digit, 10)]);
}

export function formatPersianTranscript(
  text: string,
  options: {
    normalizeLetters?: boolean;
    applyZwnj?: boolean;
    persianDigits?: boolean;
  } = { normalizeLetters: true, applyZwnj: true, persianDigits: false }
): string {
  let result = text;
  if (options.normalizeLetters) {
    result = normalizePersianLetters(result);
  }
  if (options.applyZwnj) {
    result = applyPersianZwnj(result);
  }
  if (options.persianDigits) {
    result = toPersianDigits(result);
  }
  return result;
}
