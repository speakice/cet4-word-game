export type ExamType = 'monthly' | 'pre-exam';
export type QuestionType = 'dictation' | 'completion' | 'meaning';

export interface WordProgress {
  learned: boolean;
  learnedAt?: number;
  lastPracticedAt?: number;
  practiceCount: number;
  correctCount: number;
  wrongCount: number;
  hard: boolean;
  lastCompletedDate?: string;
}

export interface DailyStudy {
  seconds: number;
  words: number;
}

export interface ExamDetail {
  word: string;
  type: QuestionType;
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  prompt?: string;
}

export interface ExamRecord {
  id: string;
  type: ExamType;
  title: string;
  startedAt: number;
  finishedAt: number;
  durationSeconds: number;
  total: number;
  correct: number;
  score: number;
  details: ExamDetail[];
}

const DAILY_KEY = 'study_daily_v1';
const PROGRESS_KEY = 'word_progress_v1';
const EXAM_KEY = 'exam_records_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`保存 ${key} 失败:`, error);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getDailyStudy(): Record<string, DailyStudy> {
  return readJson<Record<string, DailyStudy>>(DAILY_KEY, {});
}

export function addStudySeconds(seconds: number): void {
  const amount = Math.max(0, Math.floor(seconds));
  if (amount <= 0) {
    return;
  }
  const daily = getDailyStudy();
  const key = formatDateKey();
  const day = daily[key] ?? { seconds: 0, words: 0 };
  day.seconds += amount;
  daily[key] = day;
  writeJson(DAILY_KEY, daily);
}

export function getAllWordProgress(): Record<string, WordProgress> {
  return readJson<Record<string, WordProgress>>(PROGRESS_KEY, {});
}

export function getWordProgress(word: string): WordProgress {
  const all = getAllWordProgress();
  return (
    all[word] ?? {
      learned: false,
      practiceCount: 0,
      correctCount: 0,
      wrongCount: 0,
      hard: false,
    }
  );
}

function saveWordProgress(word: string, progress: WordProgress): void {
  const all = getAllWordProgress();
  all[word] = progress;
  writeJson(PROGRESS_KEY, all);
}

export function markWordCompleted(word: string): boolean {
  if (!word) {
    return false;
  }

  const now = Date.now();
  const today = formatDateKey();
  const progress = getWordProgress(word);
  const firstToday = progress.lastCompletedDate !== today;

  progress.learned = true;
  progress.learnedAt ??= now;
  progress.lastPracticedAt = now;
  progress.practiceCount += 1;

  if (firstToday) {
    progress.lastCompletedDate = today;
    const daily = getDailyStudy();
    const day = daily[today] ?? { seconds: 0, words: 0 };
    day.words += 1;
    daily[today] = day;
    writeJson(DAILY_KEY, daily);
  }

  saveWordProgress(word, progress);
  return firstToday;
}

export function markWordMistake(word: string): void {
  if (!word) {
    return;
  }
  const progress = getWordProgress(word);
  progress.lastPracticedAt = Date.now();
  progress.wrongCount += 1;
  saveWordProgress(word, progress);
}

export function markExamResult(word: string, correct: boolean): void {
  if (!word) {
    return;
  }
  const progress = getWordProgress(word);
  progress.lastPracticedAt = Date.now();
  if (correct) {
    progress.correctCount += 1;
  } else {
    progress.wrongCount += 1;
  }
  saveWordProgress(word, progress);
}

export function toggleHardWord(word: string): boolean {
  if (!word) {
    return false;
  }
  const progress = getWordProgress(word);
  progress.hard = !progress.hard;
  progress.lastPracticedAt = Date.now();
  saveWordProgress(word, progress);
  return progress.hard;
}

export function getRecentWords(days: number = 30): string[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return Object.entries(getAllWordProgress())
    .filter(([word, progress]) => {
      const practicedAt = progress.lastPracticedAt ?? progress.learnedAt ?? 0;
      return practicedAt >= cutoff && /^[A-Za-z][A-Za-z-]{2,}$/.test(word);
    })
    .sort((a, b) => {
      const aTime = a[1].lastPracticedAt ?? a[1].learnedAt ?? 0;
      const bTime = b[1].lastPracticedAt ?? b[1].learnedAt ?? 0;
      return bTime - aTime;
    })
    .map(([word]) => word);
}

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function getDifficultWords(limit: number, pool: string[]): string[] {
  const uniquePool = Array.from(
    new Set(pool.filter((word) => /^[A-Za-z][A-Za-z-]{2,}$/.test(word))),
  );
  const progress = getAllWordProgress();

  const scored = uniquePool
    .map((word) => {
      const item = progress[word];
      const score =
        (item?.hard ? 1000 : 0) +
        (item?.wrongCount ?? 0) * 50 +
        word.length * 2 +
        Math.random() * 10;
      return { word, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit).map((item) => item.word);
  if (selected.length >= limit) {
    return selected;
  }

  const selectedSet = new Set(selected);
  const fillers = shuffle(uniquePool.filter((word) => !selectedSet.has(word)));
  return selected.concat(fillers.slice(0, limit - selected.length));
}

export function getExamRecords(): ExamRecord[] {
  return readJson<ExamRecord[]>(EXAM_KEY, []).sort(
    (a, b) => b.finishedAt - a.finishedAt,
  );
}

export function saveExamRecord(record: ExamRecord): void {
  const records = getExamRecords();
  records.unshift(record);
  writeJson(EXAM_KEY, records.slice(0, 30));
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟`;
  }
  return `${safeSeconds} 秒`;
}
