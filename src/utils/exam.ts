import type { ExamType, QuestionType } from './study';

export interface ExamQuestion {
  id: string;
  word: string;
  type: QuestionType;
  display?: string;
  missingLetters?: string;
  options?: string[];
  meaningAnswer?: string;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  dictation: '听音默写',
  completion: '单词补全',
  meaning: '看词选意',
};

export function getExamTitle(type: ExamType): string {
  return type === 'monthly' ? '月考 · 最近一月' : '考前测验 · 高难 100 词';
}

export function getExamDescription(type: ExamType): string {
  return type === 'monthly'
    ? '从最近一个月练习过的单词中随机抽取 10 个，检查近期学习效果。'
    : '优先抽取重难、错题和较长单词，共 100 题，适合考前查漏补缺。';
}

export function getExamSize(type: ExamType): number {
  return type === 'monthly' ? 10 : 100;
}

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function makeCompletion(word: string): {
  display: string;
  missingLetters: string;
} | null {
  if (!/^[A-Za-z-]+$/.test(word) || word.length < 4) {
    return null;
  }

  const letterIndexes = [...word]
    .map((char, index) => (/[A-Za-z]/.test(char) ? index : -1))
    .filter((index) => index >= 0);

  if (letterIndexes.length === 0) {
    return null;
  }

  const missingIndexes = letterIndexes.filter(() => Math.random() < 0.35);
  if (missingIndexes.length === 0) {
    missingIndexes.push(
      letterIndexes[Math.floor(Math.random() * letterIndexes.length)],
    );
  }
  if (missingIndexes.length >= letterIndexes.length) {
    missingIndexes.pop();
  }

  return {
    display: [...word]
      .map((char, index) => (missingIndexes.includes(index) ? '_' : char))
      .join(''),
    missingLetters: missingIndexes.map((index) => word[index]).join(''),
  };
}

export function isExamAnswerCorrect(
  question: ExamQuestion,
  answer: string,
): boolean {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (question.type === 'meaning') {
    return normalized === (question.meaningAnswer ?? '').trim().toLowerCase();
  }

  if (question.type === 'completion') {
    return (
      normalized === (question.missingLetters ?? '').toLowerCase() ||
      normalized === question.word.toLowerCase()
    );
  }

  return normalized === question.word.toLowerCase();
}

export function buildExamQuestions(
  words: string[],
  type: ExamType,
  meanings: Record<string, string>,
): ExamQuestion[] {
  const total = getExamSize(type);
  const selectedWords = Array.from(new Set(words)).slice(0, total);
  const meaningEntries = Object.entries(meanings).filter(
    ([word, meaning]) =>
      selectedWords.includes(word) && meaning && meaning.trim(),
  );
  const canUseMeaning = new Set(meaningEntries.map(([word]) => word)).size > 0 &&
    new Set(Object.values(meanings).filter(Boolean)).size >= 4;

  const desiredMeaning = type === 'monthly' ? 3 : 20;
  const desiredCompletion = type === 'monthly' ? 3 : 40;
  const meaningWords = shuffle(
    selectedWords.filter((word) => canUseMeaning && meanings[word]),
  ).slice(0, desiredMeaning);
  const meaningSet = new Set(meaningWords);
  const remaining = selectedWords.filter((word) => !meaningSet.has(word));

  const completionTarget =
    desiredCompletion + Math.max(0, desiredMeaning - meaningWords.length);
  const completionWords = shuffle(remaining).slice(0, completionTarget);
  const completionSet = new Set(completionWords);
  const dictationWords = remaining.filter((word) => !completionSet.has(word));

  const allMeanings = Array.from(
    new Set(Object.values(meanings).filter((meaning) => meaning?.trim())),
  );
  const questions: ExamQuestion[] = [];

  for (const word of meaningWords) {
    const correctMeaning = meanings[word]?.trim();
    if (!correctMeaning) continue;
    const distractors = shuffle(
      allMeanings.filter((meaning) => meaning !== correctMeaning),
    ).slice(0, 3);
    const options = shuffle([correctMeaning, ...distractors]);
    if (options.length < 4) continue;
    questions.push({
      id: '',
      word,
      type: 'meaning',
      options,
      meaningAnswer: correctMeaning,
    });
  }

  for (const word of completionWords) {
    const completion = makeCompletion(word);
    if (!completion) {
      questions.push({ id: '', word, type: 'dictation' });
      continue;
    }
    questions.push({
      id: '',
      word,
      type: 'completion',
      display: completion.display,
      missingLetters: completion.missingLetters,
    });
  }

  const answeredWords = new Set(questions.map((item) => item.word));
  for (const word of dictationWords) {
    if (!answeredWords.has(word)) {
      questions.push({ id: '', word, type: 'dictation' });
    }
  }

  // 如果释义题因为可选项不足被跳过，用补全/默写把题量补满
  if (questions.length < selectedWords.length) {
    const usedWords = new Set(questions.map((item) => item.word));
    for (const word of selectedWords) {
      if (questions.length >= selectedWords.length) break;
      if (usedWords.has(word)) continue;
      const completion = makeCompletion(word);
      if (completion) {
        questions.push({
          id: '',
          word,
          type: 'completion',
          display: completion.display,
          missingLetters: completion.missingLetters,
        });
      } else {
        questions.push({ id: '', word, type: 'dictation' });
      }
      usedWords.add(word);
    }
  }

  return shuffle(questions)
    .slice(0, selectedWords.length)
    .map((question, index) => ({
      ...question,
      id: `${type}-${index}-${question.word}`,
    }));
}
