<script setup lang="ts">
import { computed } from 'vue';
import { formatDateKey, type DailyStudy } from '@/utils/study';

const props = defineProps<{
  data: Record<string, DailyStudy>;
}>();

const today = new Date();
today.setHours(0, 0, 0, 0);

const firstDay = new Date(today);
firstDay.setDate(today.getDate() - 181);
const mondayOffset = (firstDay.getDay() + 6) % 7;
firstDay.setDate(firstDay.getDate() - mondayOffset);

interface HeatmapDay {
  key: string;
  level: number;
  title: string;
}

const days = computed<HeatmapDay[]>(() => {
  const result: HeatmapDay[] = [];
  for (const cursor = new Date(firstDay); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const key = formatDateKey(cursor);
    const item = props.data[key];
    const seconds = item?.seconds ?? 0;
    const words = item?.words ?? 0;
    const level =
      seconds <= 0 ? 0 : seconds < 300 ? 1 : seconds < 900 ? 2 : seconds < 1800 ? 3 : 4;
    result.push({
      key,
      level,
      title: `${key} · ${Math.floor(seconds / 60)} 分钟 · ${words} 个单词`,
    });
  }
  return result;
});

const weeks = computed(() => {
  const result: HeatmapDay[][] = [];
  for (let index = 0; index < days.value.length; index += 7) {
    result.push(days.value.slice(index, index + 7));
  }
  return result;
});

const flatDays = computed(() => weeks.value.flat());
</script>

<template>
  <div class="study-heatmap">
    <div class="heatmap-grid" :style="{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }">
      <span
        v-for="day in flatDays"
        :key="day.key"
        class="heatmap-cell"
        :class="`level-${day.level}`"
        :title="day.title"
      />
    </div>
    <div class="heatmap-legend">
      <span>少</span>
      <span class="heatmap-cell level-0" />
      <span class="heatmap-cell level-1" />
      <span class="heatmap-cell level-2" />
      <span class="heatmap-cell level-3" />
      <span class="heatmap-cell level-4" />
      <span>多</span>
    </div>
  </div>
</template>

<style scoped>
.study-heatmap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.heatmap-grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 13px);
  gap: 3px;
  min-width: max-content;
}

.heatmap-cell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: #ebedf0;
}

.level-0 {
  background: #ebedf0;
}

.level-1 {
  background: #c6e48b;
}

.level-2 {
  background: #7bc96f;
}

.level-3 {
  background: #239a3b;
}

.level-4 {
  background: #196127;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.heatmap-legend .heatmap-cell {
  width: 11px;
  height: 11px;
}
</style>
