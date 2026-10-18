import { DictionaryService } from '@/api/api';

export interface CachedExplanation {
  mean_cn?: string;
  mean_en?: string;
  word_etyma?: string;
  sentence?: string;
  sentence_trans?: string;
  [key: string]: unknown;
}

export function getCachedExplanation(word: string): CachedExplanation | null {
  try {
    const raw = localStorage.getItem(word);
    return raw ? (JSON.parse(raw) as CachedExplanation) : null;
  } catch {
    return null;
  }
}

export function getCachedMeaning(word: string): string {
  return getCachedExplanation(word)?.mean_cn ?? '';
}

export function getCachedMeaningsForWords(words: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const word of words) {
    const meaning = getCachedMeaning(word);
    if (meaning) {
      result[word] = meaning;
    }
  }
  return result;
}

export async function fetchMeaning(word: string, timeoutMs = 5000): Promise<string> {
  const cached = getCachedMeaning(word);
  if (cached) {
    return cached;
  }

  let timer: number | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = window.setTimeout(() => resolve(''), timeoutMs);
  });

  const request = (DictionaryService.getWordMean(word) as Promise<{
    data: CachedExplanation;
  }>)
    .then(({ data }) => {
      if (data) {
        localStorage.setItem(word, JSON.stringify(data));
      }
      return data?.mean_cn ?? '';
    })
    .catch(() => '');

  const meaning = await Promise.race([request, timeout]);
  if (timer) {
    window.clearTimeout(timer);
  }
  return meaning;
}

/**
 * 优先使用本地缓存；缓存不足时最多等待 timeoutMs，
 * 超时后直接用已经拿到的释义继续生成题目。
 */
export async function loadMeanings(
  words: string[],
  timeoutMs = 4000,
): Promise<Record<string, string>> {
  const result = getCachedMeaningsForWords(words);
  const missing = Array.from(new Set(words)).filter((word) => !result[word]);
  if (missing.length === 0) {
    return result;
  }

  const queue = [...missing];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (queue.length > 0) {
      const word = queue.shift();
      if (!word) continue;
      const meaning = await fetchMeaning(word, timeoutMs);
      if (meaning) {
        result[word] = meaning;
      }
    }
  });

  await Promise.race([
    Promise.all(workers),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);

  return result;
}
