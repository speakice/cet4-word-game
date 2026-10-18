<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import allWords from '@/utils/words';
import audioManager from '@/utils/audio';
import { loadMeanings } from '@/utils/dictionary';
import {
  buildExamQuestions,
  getExamDescription,
  getExamSize,
  getExamTitle,
  isExamAnswerCorrect,
  QUESTION_TYPE_LABELS,
  type ExamQuestion,
} from '@/utils/exam';
import {
  addStudySeconds,
  formatDuration,
  getDifficultWords,
  getRecentWords,
  markExamResult,
  saveExamRecord,
  type ExamDetail,
  type ExamRecord,
  type ExamType,
} from '@/utils/study';

const route = useRoute();
const router = useRouter();
const type = computed<ExamType>(() =>
  route.query.type === 'pre-exam' ? 'pre-exam' : 'monthly',
);

const phase = ref<'loading' | 'running' | 'result' | 'error'>('loading');
const questions = ref<ExamQuestion[]>([]);
const currentIndex = ref(0);
const answers = ref<Record<number, { value: string; correct: boolean }>>({});
const userAnswer = ref('');
const selectedOption = ref('');
const showAnswer = ref(false);
const startedAt = ref(Date.now());
const elapsed = ref(0);
const finishedRecord = ref<ExamRecord | null>(null);
const errorMessage = ref('');
const supplementMessage = ref('');

let timer: number | undefined;

const allExamWords = Array.from(
  new Set(allWords.etc4.filter((word) => /^[A-Za-z][A-Za-z-]{2,}$/.test(word))),
);

const currentQuestion = computed(() => questions.value[currentIndex.value]);
const currentAnswer = computed(() => answers.value[currentIndex.value]);
const answeredCount = computed(() => Object.keys(answers.value).length);
const progressPercent = computed(() =>
  questions.value.length
    ? Math.round((answeredCount.value / questions.value.length) * 100)
    : 0,
);
const wrongQuestions = computed(
  () => finishedRecord.value?.details.filter((item) => !item.correct) ?? [],
);
const correctAnswerText = computed(() => {
  const question = currentQuestion.value;
  if (!question) return '';
  if (question.type === 'meaning') return question.meaningAnswer ?? '';
  if (question.type === 'completion') {
    return question.missingLetters
      ? `${question.missingLetters}（${question.word}）`
      : question.word;
  }
  return question.word;
});

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function stopTimer(): void {
  if (timer) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

function startTimer(): void {
  stopTimer();
  timer = window.setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt.value) / 1000);
  }, 1000);
}

async function prepareExam(): Promise<void> {
  stopTimer();
  phase.value = 'loading';
  questions.value = [];
  answers.value = {};
  currentIndex.value = 0;
  userAnswer.value = '';
  selectedOption.value = '';
  showAnswer.value = false;
  finishedRecord.value = null;
  errorMessage.value = '';
  supplementMessage.value = '';

  const total = getExamSize(type.value);
  let words: string[] = [];

  if (type.value === 'monthly') {
    const recent = getRecentWords(30).filter((word) =>
      allExamWords.includes(word),
    );
    words = shuffle(recent).slice(0, total);
    if (words.length < total) {
      supplementMessage.value =
        words.length === 0
          ? '最近一月还没有练习记录，已用全部词汇生成模拟月考。'
          : `最近一月练习 ${words.length} 个单词，不足 10 个的部分已用全部词汇补充。`;
      const rest = shuffle(
        allExamWords.filter((word) => !words.includes(word)),
      ).slice(0, total - words.length);
      words = words.concat(rest);
    }
  } else {
    words = getDifficultWords(total, allExamWords);
  }

  if (words.length === 0) {
    phase.value = 'error';
    errorMessage.value = '没有可用的单词，请先添加词汇。';
    return;
  }

  const meaningTargets = words.slice(0, type.value === 'monthly' ? 10 : 30);
  const meanings = await loadMeanings(meaningTargets, 3500);
  questions.value = buildExamQuestions(words, type.value, meanings);

  if (questions.value.length === 0) {
    phase.value = 'error';
    errorMessage.value = '题目生成失败，请返回重试。';
    return;
  }

  startedAt.value = Date.now();
  elapsed.value = 0;
  phase.value = 'running';
  startTimer();
  void playWord();
}

function playWord(): void {
  const word = currentQuestion.value?.word;
  if (word) {
    void audioManager.playOnlineAudio(word);
  }
}

function submitAnswer(): void {
  const question = currentQuestion.value;
  if (!question || currentAnswer.value) {
    return;
  }

  const value =
    question.type === 'meaning'
      ? selectedOption.value
      : userAnswer.value.trim();
  if (!value) {
    return;
  }

  const correct = isExamAnswerCorrect(question, value);
  answers.value = {
    ...answers.value,
    [currentIndex.value]: { value, correct },
  };
  showAnswer.value = true;
  markExamResult(question.word, correct);
}

function goToQuestion(index: number): void {
  if (index < 0 || index >= questions.value.length) {
    return;
  }
  currentIndex.value = index;
  const question = questions.value[index];
  const answer = answers.value[index];
  showAnswer.value = Boolean(answer);
  userAnswer.value = answer && question.type !== 'meaning' ? answer.value : '';
  selectedOption.value =
    answer && question.type === 'meaning' ? answer.value : '';
  if (question.type === 'dictation' && !answer) {
    void playWord();
  }
}

function prevQuestion(): void {
  goToQuestion(currentIndex.value - 1);
}

function nextQuestion(): void {
  if (currentIndex.value >= questions.value.length - 1) {
    void finishExam();
    return;
  }
  goToQuestion(currentIndex.value + 1);
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function finishExam(): Promise<void> {
  if (phase.value !== 'running') {
    return;
  }

  const unanswered = questions.value.length - answeredCount.value;
  if (unanswered > 0) {
    try {
      await ElMessageBox.confirm(
        `还有 ${unanswered} 题未作答，未作答按错误计分，确定交卷吗？`,
        '交卷确认',
        {
          confirmButtonText: '确定交卷',
          cancelButtonText: '继续答题',
          type: 'warning',
        },
      );
    } catch {
      return;
    }
  }

  const details: ExamDetail[] = questions.value.map((question, index) => {
    const answer = answers.value[index];
    let correctAnswer = question.word;
    if (question.type === 'meaning') {
      correctAnswer = question.meaningAnswer ?? '';
    } else if (question.type === 'completion') {
      correctAnswer = question.missingLetters
        ? `${question.missingLetters}（${question.word}）`
        : question.word;
    }
    return {
      word: question.word,
      type: question.type,
      correct: Boolean(answer?.correct),
      userAnswer: answer?.value ?? '',
      correctAnswer,
      prompt: question.display,
    };
  });

  const correct = details.filter((item) => item.correct).length;
  const durationSeconds = Math.max(
    1,
    Math.round((Date.now() - startedAt.value) / 1000),
  );
  const record: ExamRecord = {
    id: createId(),
    type: type.value,
    title: getExamTitle(type.value),
    startedAt: startedAt.value,
    finishedAt: Date.now(),
    durationSeconds,
    total: questions.value.length,
    correct,
    score: Math.round((correct / questions.value.length) * 100),
    details,
  };

  saveExamRecord(record);
  addStudySeconds(durationSeconds);
  finishedRecord.value = record;
  phase.value = 'result';
  stopTimer();
  audioManager.stopOnlineAudio();
}

function restart(): void {
  void prepareExam();
}

function goPractice(word: string): void {
  router.push({ path: '/', query: { word } });
}

watch(type, () => {
  void prepareExam();
});

onMounted(() => {
  void prepareExam();
});

onUnmounted(() => {
  stopTimer();
  audioManager.stopOnlineAudio();
});
</script>

<template>
  <main class="exam-page">
    <div class="exam-inner">
      <header class="exam-header">
        <div>
          <el-button text class="back-link" @click="router.push('/profile')">
            ← 个人中心
          </el-button>
          <h1>{{ getExamTitle(type) }}</h1>
          <p>{{ getExamDescription(type) }}</p>
        </div>
        <div v-if="phase === 'running'" class="exam-header-right">
          <span class="timer">{{ formatDuration(elapsed) }}</span>
          <el-button type="danger" plain @click="finishExam">交卷</el-button>
        </div>
      </header>

      <section v-if="phase === 'loading'" class="panel loading-panel">
        <div class="loading-dot" />
        正在准备题目...
      </section>

      <section v-else-if="phase === 'error'" class="panel">
        <el-empty :description="errorMessage">
          <el-button type="primary" @click="router.push('/profile')">
            返回个人中心
          </el-button>
        </el-empty>
      </section>

      <section v-else-if="phase === 'running'" class="exam-layout">
        <div class="panel question-panel">
          <div class="question-top">
            <span>第 {{ currentIndex + 1 }} / {{ questions.length }} 题</span>
            <el-tag size="small">{{ QUESTION_TYPE_LABELS[currentQuestion.type] }}</el-tag>
          </div>
          <el-progress :percentage="progressPercent" :show-text="false" />

          <div v-if="supplementMessage" class="supplement-note">
            {{ supplementMessage }}
          </div>

          <div class="question-body">
            <template v-if="currentQuestion.type === 'dictation'">
              <p class="question-tip">听发音，写出完整单词</p>
              <button class="play-button" type="button" @click="playWord">
                <span class="play-icon">▶</span>
                播放发音
              </button>
              <el-input
                v-model="userAnswer"
                class="answer-input"
                placeholder="输入单词"
                :disabled="showAnswer"
                @keyup.enter="submitAnswer"
              />
            </template>

            <template v-else-if="currentQuestion.type === 'completion'">
              <p class="question-tip">补全缺失字母</p>
              <div class="word-display">{{ currentQuestion.display }}</div>
              <el-input
                v-model="userAnswer"
                class="answer-input"
                placeholder="输入缺失的字母，或完整单词"
                :disabled="showAnswer"
                @keyup.enter="submitAnswer"
              />
            </template>

            <template v-else>
              <p class="question-tip">选择正确的中文释义</p>
              <div class="word-display">{{ currentQuestion.word }}</div>
              <div class="option-list">
                <button
                  v-for="option in currentQuestion.options"
                  :key="option"
                  type="button"
                  class="option-button"
                  :class="{ selected: selectedOption === option }"
                  :disabled="showAnswer"
                  @click="selectedOption = option"
                >
                  {{ option }}
                </button>
              </div>
            </template>

            <div
              v-if="showAnswer"
              class="answer-feedback"
              :class="currentAnswer?.correct ? 'correct' : 'wrong'"
            >
              <strong>{{ currentAnswer?.correct ? '回答正确' : '回答错误' }}</strong>
              <p>正确答案：{{ correctAnswerText }}</p>
            </div>
          </div>

          <div class="question-actions">
            <el-button :disabled="currentIndex === 0" @click="prevQuestion">上一题</el-button>
            <el-button v-if="!showAnswer" type="primary" @click="submitAnswer">
              提交答案
            </el-button>
            <el-button v-else type="primary" @click="nextQuestion">
              {{ currentIndex === questions.length - 1 ? '完成并查看结果' : '下一题' }}
            </el-button>
          </div>
        </div>

        <div class="panel sheet-panel">
          <div class="sheet-title">
            <h3>答题卡</h3>
            <span>{{ answeredCount }} / {{ questions.length }}</span>
          </div>
          <div class="question-sheet">
            <button
              v-for="(question, index) in questions"
              :key="question.id"
              type="button"
              class="sheet-cell"
              :class="{
                current: index === currentIndex,
                answered: answers[index],
                correct: answers[index]?.correct,
                wrong: answers[index] && !answers[index]?.correct,
              }"
              @click="goToQuestion(index)"
            >
              {{ index + 1 }}
            </button>
          </div>
          <el-button class="finish-button" type="danger" plain @click="finishExam">
            提前交卷
          </el-button>
        </div>
      </section>

      <section v-else-if="phase === 'result'" class="panel result-panel">
        <div class="result-score">
          {{ finishedRecord?.score }}<span>分</span>
        </div>
        <h2>
          {{
            (finishedRecord?.score ?? 0) >= 80
              ? '掌握得不错'
              : (finishedRecord?.score ?? 0) >= 60
                ? '还需要再巩固'
                : '建议再练一轮'
          }}
        </h2>
        <p>
          {{ finishedRecord?.correct }} / {{ finishedRecord?.total }} 正确 · 用时
          {{ formatDuration(finishedRecord?.durationSeconds ?? 0) }}
        </p>
        <div class="result-actions">
          <el-button type="primary" @click="restart">再考一次</el-button>
          <el-button @click="router.push('/profile')">返回个人中心</el-button>
        </div>

        <div v-if="wrongQuestions.length" class="wrong-list">
          <h3>错题（{{ wrongQuestions.length }}）</h3>
          <div
            v-for="item in wrongQuestions"
            :key="item.word"
            class="wrong-row"
            @click="goPractice(item.word)"
          >
            <div class="wrong-word">
              <strong>{{ item.word }}</strong>
              <span>{{ QUESTION_TYPE_LABELS[item.type] }}</span>
            </div>
            <span class="wrong-answer">正确答案：{{ item.correctAnswer }}</span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
.exam-page {
  min-height: 100vh;
  background: #f5f7fa;
  color: #303133;
  padding: 28px 20px 60px;
}

.exam-inner {
  max-width: 1060px;
  margin: 0 auto;
}

.exam-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;

  h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 6px 0 4px;
  }

  p {
    color: #909399;
    font-size: 13px;
  }
}

.back-link {
  padding-left: 0;
  color: #909399;
}

.exam-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.timer {
  color: #606266;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
}

.panel {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
}

.loading-panel {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #909399;
}

.loading-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #409eff;
  animation: pulse 1s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.exam-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: start;
}

.question-panel {
  min-height: 470px;
  display: flex;
  flex-direction: column;
}

.question-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #909399;
  font-size: 13px;
}

.supplement-note {
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 12px;
  line-height: 1.5;
}

.question-body {
  flex: 1;
  padding: 34px 10px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.question-tip {
  color: #909399;
  font-size: 14px;
}

.play-button {
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 999px;
  padding: 12px 22px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #409eff;
  font-size: 15px;
  transition: all 0.15s ease;

  &:hover {
    border-color: #409eff;
    background: #ecf5ff;
  }
}

.play-icon {
  font-size: 12px;
}

.answer-input {
  width: min(420px, 100%);

  :deep(.el-input__wrapper) {
    padding: 6px 14px;
    font-size: 18px;
  }
}

.word-display {
  font-size: 42px;
  font-weight: 700;
  letter-spacing: 6px;
  text-align: center;
  word-break: break-word;
}

.option-list {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-button {
  width: 100%;
  text-align: left;
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 10px;
  padding: 12px 16px;
  color: #303133;
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    border-color: #409eff;
    background: #f5f9ff;
  }

  &.selected {
    border-color: #409eff;
    background: #ecf5ff;
    color: #2b6cb0;
  }
}

.answer-feedback {
  width: min(560px, 100%);
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;

  strong {
    display: block;
    margin-bottom: 4px;
  }

  p {
    color: #606266;
  }
}

.answer-feedback.correct {
  background: #f0f9eb;
  color: #529b2e;
}

.answer-feedback.wrong {
  background: #fef0f0;
  color: #c45656;
}

.question-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #f0f2f5;
  padding-top: 16px;
}

.sheet-panel {
  position: sticky;
  top: 20px;
}

.sheet-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;

  h3 {
    font-size: 17px;
    font-weight: 700;
  }

  span {
    color: #909399;
    font-size: 12px;
  }
}

.question-sheet {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
  gap: 6px;
  max-height: 390px;
  overflow-y: auto;
  padding-right: 2px;
}

.sheet-cell {
  height: 30px;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
  background: #fff;
  color: #606266;
  font-size: 12px;
  cursor: pointer;

  &.answered {
    border-color: #b3d8ff;
    background: #ecf5ff;
    color: #409eff;
  }

  &.correct {
    border-color: #b3e19d;
    background: #f0f9eb;
    color: #529b2e;
  }

  &.wrong {
    border-color: #fab6b6;
    background: #fef0f0;
    color: #c45656;
  }

  &.current {
    outline: 2px solid #409eff;
    outline-offset: 1px;
  }
}

.finish-button {
  width: 100%;
  margin-top: 16px;
}

.result-panel {
  text-align: center;
  padding: 42px 24px 30px;
}

.result-score {
  font-size: 76px;
  font-weight: 800;
  line-height: 1;
  color: #409eff;

  span {
    font-size: 22px;
    font-weight: 500;
    margin-left: 4px;
    color: #909399;
  }
}

.result-panel h2 {
  margin-top: 12px;
  font-size: 22px;
  font-weight: 700;
}

.result-panel > p {
  margin-top: 6px;
  color: #909399;
  font-size: 13px;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.wrong-list {
  margin-top: 30px;
  text-align: left;
  border-top: 1px solid #f0f2f5;
  padding-top: 18px;

  h3 {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 8px;
  }
}

.wrong-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 8px;
  border-bottom: 1px solid #f0f2f5;
  cursor: pointer;

  &:hover {
    background: #f7f9fc;
  }
}

.wrong-word {
  display: flex;
  align-items: baseline;
  gap: 10px;

  strong {
    font-size: 15px;
  }

  span {
    color: #909399;
    font-size: 12px;
  }
}

.wrong-answer {
  color: #909399;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 860px) {
  .exam-layout {
    grid-template-columns: 1fr;
  }

  .sheet-panel {
    position: static;
  }

  .question-sheet {
    max-height: 260px;
  }
}

@media (max-width: 600px) {
  .exam-page {
    padding: 18px 12px 40px;
  }

  .exam-header {
    flex-direction: column;
  }

  .word-display {
    font-size: 32px;
    letter-spacing: 3px;
  }

  .result-score {
    font-size: 60px;
  }
}
</style>
