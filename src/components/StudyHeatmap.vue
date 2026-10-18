<script setup lang="ts">
import { computed } from 'vue';
import { formatDateKey, type DailyStudy } from '@/utils/study';

const props = defineProps<{
  data: Record<string, DailyStudy>;
}>();

interface HeatmapDay {
  key: string;
  level: number;
  title: string;
  future: boolean;
}

const today = new Date();
today.setHours(0, 0, 0, 0);

// 从一年前的周一开始，保证热力图是完整的 7 行 × 约 53 列
const firstDay = new Date(today);
firstDay.setDate(today.getDate() - 364);
firstDay.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));

const endDay = new Date(today);
endDay.setDate(today.getDate() + (6 - ((today.getDay() + 6) % 7)));

const days = computed<HeatmapDay[]>(() => {
  const result: HeatmapDay[] = [];
  for (const cursor = new Date(firstDay); cursor <= endDay; cursor.setDate(cursor.getDate() + 1)) {
    const key = formatDateKey(cursor);
    const future = cursor > today;
    const item = future ? undefined : props.data[key];
    const seconds = item?.seconds ?? 0;
    const words = item?.words ?? 0;
    const level =
      seconds <= 0 ? 0 : seconds < 300 ? 1 : seconds < 900 ? 2 : seconds < 1800 ? 3 : 4;
    result.push({
      key,
      level: future ? 0 : level,
      future,
      title: future
        ? ''
        : `${key} · ${Math.floor(seconds / 60)} 分钟 · ${words} 个单词`,
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

const monthLabels = computed(() => {
  let previous = '';
  return weeks.value.map((week) => {
    const month = week[0]?.key.slice(5, 7) ?? '';
    if (month && month !== previous) {
      previous = month;
      return `${Number(month)}月`;
    }
    return '';
  });
});

const weekdayLabels = ['一', '', '三', '', '五', '', ''];
</script>

<template>
  <div class="study-heatmap">
    <div class="heatmap-body">
      <div class="weekday-labels">
        <span v-for="(label, index) in weekdayLabels" :key="index">{{ label }}</span>
      </div>
      <div class="heatmap-main">
        <div
          class="heatmap-months"
          :style="{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }"
        >
          <span v-for="(label, index) in monthLabels" :key="index">{{ label }}</span>
        </div>
        <div
          class="heatmap-grid"
          :style="{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }"
        >
          <span
            v-for="day in flatDays"
            :key="day.key"
            class="heatmap-cell"
            :class="[`level-${day.level}`, { future: day.future }]"
            :title="day.title"
          />
        </div>
      </div>
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
  width: 100%;
  overflow-x: auto;
  padding-bottom: 4px;
}

.heatmap-body {
  display: flex;
  align-items: stretch;
  gap: 6px;
  min-width: 760px;
}

.weekday-labels {
  width: 14px;
  flex: 0 0 14px;
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  padding-top: 24px;
  color: #909399;
  font-size: 10px;
  line-height: 1;
}

.heatmap-main {
  flex: 1;
  min-width: 0;
}

.heatmap-months {
  display: grid;
  gap: 3px;
  height: 18px;
  margin-bottom: 6px;
  color: #909399;
  font-size: 11px;
  line-height: 18px;
}

.heatmap-months span {
  overflow: visible;
  white-space: nowrap;
}

.heatmap-grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, auto);
  gap: 3px;
  width: 100%;
}

.heatmap-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  background: #ebedf0;
}

.heatmap-cell.future {
  background: transparent;
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
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
}

.heatmap-legend .heatmap-cell {
  width: 11px;
  height: 11px;
  aspect-ratio: auto;
}
</style>
