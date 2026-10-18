<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import allWords from '@/utils/words';
import StudyHeatmap from '@/components/StudyHeatmap.vue';
import { getCachedMeaning } from '@/utils/dictionary';
import {
  bootstrapProgressFromLegacy,
  formatDuration,
  getAllWordProgress,
  getDailyStudy,
  getExamRecords,
  toggleHardWord,
  type DailyStudy,
  type ExamRecord,
  type WordProgress,
} from '@/utils/study';

type WordTab = 'all' | 'learned' | 'hard' | 'unlearned';

const router = useRouter();
const daily = ref<Record<string, DailyStudy>>({});
const progress = ref<Record<string, WordProgress>>({});
const examRecords = ref<ExamRecord[]>([]);

const activeTab = ref<WordTab>('all');
const searchText = ref('');
const currentPage = ref(1);
const pageSize = 50;

const recordDialogVisible = ref(false);
const selectedRecord = ref<ExamRecord | null>(null);
const heatmapPanelRef = ref<HTMLElement | null>(null);
const examPanelRef = ref<HTMLElement | null>(null);
const vocabPanelRef = ref<HTMLElement | null>(null);

const allWordList = computed(() =>
  Array.from(new Set(allWords.etc4.filter(Boolean))),
);
const learnedWords = computed(() =>
  allWordList.value.filter((word) => progress.value[word]?.learned),
);
const hardWords = computed(() =>
  allWordList.value.filter((word) => progress.value[word]?.hard),
);
const unlearnedWords = computed(() =>
  allWordList.value.filter((word) => !progress.value[word]?.learned),
);

const recentWords = computed(() => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return Object.entries(progress.value)
    .filter(([word, item]) => {
      const practicedAt = item.lastPracticedAt ?? item.learnedAt ?? 0;
      return practicedAt >= cutoff && allWordList.value.includes(word);
    })
    .sort((a, b) => {
      const aTime = a[1].lastPracticedAt ?? a[1].learnedAt ?? 0;
      const bTime = b[1].lastPracticedAt ?? b[1].learnedAt ?? 0;
      return bTime - aTime;
    })
    .map(([word]) => word);
});

const baseWords = computed(() => {
  if (activeTab.value === 'learned') return learnedWords.value;
  if (activeTab.value === 'hard') return hardWords.value;
  if (activeTab.value === 'unlearned') return unlearnedWords.value;
  return allWordList.value;
});

const filteredWords = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  if (!keyword) return baseWords.value;
  return baseWords.value.filter((word) => word.toLowerCase().includes(keyword));
});

const total = computed(() => filteredWords.value.length);
const pagedWords = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredWords.value.slice(start, start + pageSize).map((word) => ({
    word,
    meaning: getCachedMeaning(word),
    progress: progress.value[word],
  }));
});

const totalSeconds = computed(() =>
  Object.values(daily.value).reduce((sum, item) => sum + item.seconds, 0),
);
const totalWordsToday = computed(() => {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return daily.value[key]?.words ?? 0;
});
const averageScore = computed(() => {
  if (examRecords.value.length === 0) return 0;
  return Math.round(
    examRecords.value.reduce((sum, record) => sum + record.score, 0) /
      examRecords.value.length,
  );
});

const tabCounts = computed(() => ({
  all: allWordList.value.length,
  learned: learnedWords.value.length,
  hard: hardWords.value.length,
  unlearned: unlearnedWords.value.length,
}));

watch([activeTab, searchText], () => {
  currentPage.value = 1;
});

watch(total, (value) => {
  const maxPage = Math.max(1, Math.ceil(value / pageSize));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

function refresh(): void {
  daily.value = getDailyStudy();
  progress.value = getAllWordProgress();
  examRecords.value = getExamRecords();
}

function goPractice(word: string): void {
  recordDialogVisible.value = false;
  router.push({ path: '/', query: { word } });
}

function scrollToPanel(element: HTMLElement | null): void {
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openWordTab(tab: WordTab): void {
  activeTab.value = tab;
  currentPage.value = 1;
  requestAnimationFrame(() => scrollToPanel(vocabPanelRef.value));
}

function startExam(type: 'monthly' | 'pre-exam'): void {
  router.push({ path: '/exam', query: { type } });
}

function toggleHard(word: string): void {
  toggleHardWord(word);
  progress.value = getAllWordProgress();
}

function openRecord(record: ExamRecord): void {
  selectedRecord.value = record;
  recordDialogVisible.value = true;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function examTypeLabel(type: string): string {
  return type === 'monthly' ? '月考' : '考前测验';
}

function questionTypeLabel(type: string): string {
  if (type === 'dictation') return '听音默写';
  if (type === 'completion') return '单词补全';
  return '看词选意';
}

onMounted(() => {
  bootstrapProgressFromLegacy(allWordList.value);
  refresh();
});
</script>

<template>
  <main class="profile-page">
    <div class="profile-inner">
      <header class="profile-header">
        <div>
          <h1>个人中心</h1>
          <p>学习记录保存在本机浏览器里；学习时长从本版本开始记录，已学词汇会兼容历史进度。</p>
        </div>
        <el-button class="back-button" @click="router.push('/')">返回练习</el-button>
      </header>

      <section class="stats-grid">
        <div class="stat-card clickable" @click="scrollToPanel(heatmapPanelRef)">
          <span class="stat-label">累计学习</span>
          <strong>{{ formatDuration(totalSeconds) }}</strong>
          <span class="stat-hint">今天 {{ totalWordsToday }} 个单词</span>
        </div>
        <div class="stat-card clickable" @click="openWordTab('all')">
          <span class="stat-label">总词汇</span>
          <strong>{{ tabCounts.all }}</strong>
          <span class="stat-hint">四级词汇表</span>
        </div>
        <div class="stat-card clickable" @click="openWordTab('learned')">
          <span class="stat-label">已学</span>
          <strong>{{ tabCounts.learned }}</strong>
          <span class="stat-hint">完成过拼写</span>
        </div>
        <div class="stat-card clickable" @click="openWordTab('hard')">
          <span class="stat-label">重难收藏</span>
          <strong>{{ tabCounts.hard }}</strong>
          <span class="stat-hint">手动标记</span>
        </div>
        <div class="stat-card clickable" @click="openWordTab('unlearned')">
          <span class="stat-label">未学</span>
          <strong>{{ tabCounts.unlearned }}</strong>
          <span class="stat-hint">待开始</span>
        </div>
        <div class="stat-card clickable" @click="scrollToPanel(examPanelRef)">
          <span class="stat-label">考试</span>
          <strong>{{ examRecords.length }} 次</strong>
          <span class="stat-hint">平均 {{ averageScore }} 分</span>
        </div>
      </section>

      <section ref="heatmapPanelRef" class="panel heatmap-panel">
        <div class="panel-title">
          <div>
            <h2>学习时长热力图</h2>
            <p>最近一年 · 每格一天 · 颜色越深表示练得越久</p>
          </div>
          <span class="panel-total">{{ formatDuration(totalSeconds) }}</span>
        </div>
        <StudyHeatmap :data="daily" />
      </section>

      <section ref="examPanelRef" class="panel exam-panel">
        <div class="panel-title">
          <div>
            <h2>考试入口</h2>
            <p>考完自动记录分数和错题</p>
          </div>
        </div>
        <div class="exam-grid">
          <div class="exam-card">
            <span class="exam-kicker">MONTHLY</span>
            <h3>月考</h3>
            <p>最近一个月学习内容，随机 10 个单词。</p>
            <span class="exam-hint">最近一月练习 {{ recentWords.length }} 词</span>
            <el-button type="primary" @click="startExam('monthly')">开始月考</el-button>
          </div>
          <div class="exam-card pre-exam">
            <span class="exam-kicker">PRE-EXAM</span>
            <h3>考前测验</h3>
            <p>优先抽取重难、错题和较长单词，共 100 题。</p>
            <span class="exam-hint">重难收藏 {{ tabCounts.hard }} 词</span>
            <el-button type="danger" plain @click="startExam('pre-exam')">开始测验</el-button>
          </div>
        </div>

        <div class="records-header">
          <h3>考试记录</h3>
          <span>{{ examRecords.length }} 次</span>
        </div>
        <el-empty v-if="examRecords.length === 0" description="还没有考试记录" />
        <div v-else class="record-list">
          <div
            v-for="record in examRecords"
            :key="record.id"
            class="record-row"
            @click="openRecord(record)"
          >
            <div class="record-main">
              <el-tag :type="record.type === 'monthly' ? 'primary' : 'danger'" size="small">
                {{ examTypeLabel(record.type) }}
              </el-tag>
              <span>{{ formatDate(record.finishedAt) }}</span>
              <span class="record-duration">{{ formatDuration(record.durationSeconds) }}</span>
            </div>
            <div class="record-score">
              <strong>{{ record.score }}</strong>
              <span>分 · {{ record.correct }}/{{ record.total }}</span>
            </div>
          </div>
        </div>
      </section>

      <section ref="vocabPanelRef" class="panel vocabulary-panel">
        <div class="panel-title">
          <div>
            <h2>词汇列表</h2>
            <p>点击单词直接进入练习页</p>
          </div>
          <el-input
            v-model="searchText"
            class="word-search"
            placeholder="搜索单词"
            clearable
          />
        </div>

        <el-tabs v-model="activeTab">
          <el-tab-pane :label="`全部词汇 ${tabCounts.all}`" name="all" />
          <el-tab-pane :label="`已学词汇 ${tabCounts.learned}`" name="learned" />
          <el-tab-pane :label="`重难收藏 ${tabCounts.hard}`" name="hard" />
          <el-tab-pane :label="`未学词本 ${tabCounts.unlearned}`" name="unlearned" />
        </el-tabs>

        <div v-if="pagedWords.length" class="word-list">
          <div
            v-for="item in pagedWords"
            :key="item.word"
            class="word-row"
            @click="goPractice(item.word)"
          >
            <div class="word-main">
              <span class="word">{{ item.word }}</span>
              <span v-if="item.meaning" class="meaning">{{ item.meaning }}</span>
            </div>
            <div class="word-meta">
              <el-tag v-if="item.progress?.learned" type="success" size="small">已学</el-tag>
              <el-tag v-if="item.progress?.hard" type="warning" size="small">重难</el-tag>
              <span v-if="item.progress?.wrongCount" class="wrong-count">
                错 {{ item.progress.wrongCount }}
              </span>
              <el-button text class="star-button" @click.stop="toggleHard(item.word)">
                {{ item.progress?.hard ? '★' : '☆' }}
              </el-button>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无词汇" />

        <div class="pagination">
          <el-pagination
            v-model:current-page="currentPage"
            background
            layout="prev, pager, next"
            :page-size="pageSize"
            :total="total"
          />
        </div>
      </section>

    </div>

    <el-dialog v-model="recordDialogVisible" title="考试详情" width="min(780px, 92vw)">
      <template v-if="selectedRecord">
        <div class="record-detail-summary">
          <div><span>类型</span><strong>{{ examTypeLabel(selectedRecord.type) }}</strong></div>
          <div><span>得分</span><strong>{{ selectedRecord.score }} 分</strong></div>
          <div><span>正确</span><strong>{{ selectedRecord.correct }}/{{ selectedRecord.total }}</strong></div>
          <div><span>用时</span><strong>{{ formatDuration(selectedRecord.durationSeconds) }}</strong></div>
        </div>
        <el-table :data="selectedRecord.details" height="420" class="record-detail-table">
          <el-table-column prop="word" label="单词" width="150" />
          <el-table-column label="题型" width="100">
            <template #default="{ row }">{{ questionTypeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="90">
            <template #default="{ row }">
              <el-tag :type="row.correct ? 'success' : 'danger'" size="small">
                {{ row.correct ? '正确' : '错误' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="userAnswer" label="你的答案" />
          <el-table-column prop="correctAnswer" label="正确答案" />
          <el-table-column label="" width="70">
            <template #default="{ row }">
              <el-button text @click="goPractice(row.word)">练习</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped lang="scss">
.profile-page {
  min-height: 100vh;
  background: #f5f7fa;
  color: #303133;
  padding: 28px 20px 60px;
}

.profile-inner {
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

.profile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;

  h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  p {
    color: #909399;
    font-size: 13px;
  }
}

.back-button {
  margin-top: 4px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.stat-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    font-size: 20px;
    color: #303133;
  }
}

.stat-card.clickable {
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
  }
}

.stat-label,
.stat-hint {
  color: #909399;
  font-size: 12px;
}

.stat-hint {
  color: #b1b3b8;
}

.panel {
  background: #fff;
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
  margin-bottom: 18px;
}

.panel-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h2 {
    font-size: 19px;
    font-weight: 700;
    margin-bottom: 3px;
  }

  p {
    color: #909399;
    font-size: 13px;
  }
}

.panel-total {
  color: #606266;
  font-weight: 600;
  white-space: nowrap;
}

.heatmap-panel {
  overflow: hidden;
}

.word-search {
  width: 220px;
}

.word-list {
  border-top: 1px solid #f0f2f5;
}

.word-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 8px;
  border-bottom: 1px solid #f0f2f5;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: #f7f9fc;
  }
}

.word-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.word {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  flex-shrink: 0;
}

.meaning {
  color: #909399;
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.word-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.wrong-count {
  color: #f56c6c;
  font-size: 12px;
}

.star-button {
  font-size: 18px;
  color: #e6a23c;
  padding: 0 4px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.exam-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.exam-card {
  border: 1px solid #e4e7ed;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  background: linear-gradient(135deg, #f8fbff, #fff);

  h3 {
    font-size: 20px;
    font-weight: 700;
  }

  p {
    color: #606266;
    font-size: 13px;
    line-height: 1.6;
  }

  .el-button {
    margin-top: 6px;
  }
}

.exam-card.pre-exam {
  background: linear-gradient(135deg, #fff8f6, #fff);
}

.exam-kicker {
  color: #b1b3b8;
  font-size: 11px;
  letter-spacing: 1px;
}

.exam-hint {
  color: #909399;
  font-size: 12px;
}

.records-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 26px;
  margin-bottom: 10px;
  border-top: 1px solid #f0f2f5;
  padding-top: 18px;

  h3 {
    font-size: 17px;
    font-weight: 700;
  }

  span {
    color: #909399;
    font-size: 12px;
  }
}

.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 8px;
  border-bottom: 1px solid #f0f2f5;
  cursor: pointer;

  &:hover {
    background: #f7f9fc;
  }
}

.record-main {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #606266;
  font-size: 13px;
}

.record-duration {
  color: #b1b3b8;
}

.record-score {
  display: flex;
  align-items: baseline;
  gap: 4px;

  strong {
    font-size: 20px;
    color: #303133;
  }

  span {
    color: #909399;
    font-size: 12px;
  }
}

.record-detail-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;

  div {
    background: #f5f7fa;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  span {
    color: #909399;
    font-size: 12px;
  }

  strong {
    color: #303133;
    font-size: 16px;
  }
}

@media (max-width: 640px) {
  .profile-page {
    padding: 18px 12px 40px;
  }

  .profile-header {
    flex-direction: column;
  }

  .panel {
    padding: 16px;
  }

  .panel-title {
    flex-direction: column;
  }

  .word-search {
    width: 100%;
  }

  .word-main {
    flex-direction: column;
    gap: 2px;
  }

  .meaning {
    white-space: normal;
  }

  .record-detail-summary {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
