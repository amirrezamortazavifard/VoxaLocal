import { WordItem } from '../types/asr';

export function wordsToPlainString(words: WordItem[]): string {
  let str = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i > 0 && !w.join) {
      str += ' ';
    }
    str += w.text;
  }
  return str;
}

export function exportAsFile(content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportWordsAsJson(
  title: string,
  words: WordItem[],
  language: string,
  durationSecs: number
): string {
  const data = {
    title,
    recordedAt: new Date().toISOString(),
    language,
    durationSecs,
    wordCount: words.length,
    fullText: wordsToPlainString(words),
    words: words.map((w) => ({
      text: w.text,
      start: Number(w.start.toFixed(3)),
      end: Number(w.end.toFixed(3)),
      join: w.join,
    })),
  };
  return JSON.stringify(data, null, 2);
}

export function generateSrtFromWords(words: WordItem[]): string {
  if (!words || words.length === 0) return '';

  const segments: Array<{ start: number; end: number; words: WordItem[] }> = [];
  let currentSegment: WordItem[] = [];
  let segStart = words[0].start;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentSegment.length === 0) {
      segStart = w.start;
      currentSegment.push(w);
      continue;
    }

    const lastW = currentSegment[currentSegment.length - 1];
    const gap = w.start - lastW.end;
    const duration = w.end - segStart;
    const isPunctuationEnd = /[.!?؟]$/.test(lastW.text);

    if (currentSegment.length >= 8 || gap > 0.4 || duration > 4.5 || isPunctuationEnd) {
      segments.push({
        start: segStart,
        end: lastW.end,
        words: [...currentSegment],
      });
      currentSegment = [];
      segStart = w.start;
    }

    currentSegment.push(w);
  }

  if (currentSegment.length > 0) {
    const lastW = currentSegment[currentSegment.length - 1];
    segments.push({
      start: segStart,
      end: lastW.end,
      words: currentSegment,
    });
  }

  let srt = '';
  segments.forEach((seg, idx) => {
    const num = idx + 1;
    const startTs = formatTimestampSrt(seg.start);
    const endTs = formatTimestampSrt(seg.end);
    const text = wordsToPlainString(seg.words);
    srt += `${num}\n${startTs} --> ${endTs}\n${text}\n\n`;
  });

  return srt;
}

function formatTimestampSrt(seconds: number): string {
  const totalMillis = Math.round(Math.max(0, seconds) * 1000);
  const hours = Math.floor(totalMillis / 3600000);
  const minutes = Math.floor((totalMillis % 3600000) / 60000);
  const secs = Math.floor((totalMillis % 60000) / 1000);
  const millis = totalMillis % 1000;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}
