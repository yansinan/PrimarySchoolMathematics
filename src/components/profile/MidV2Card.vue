<!--
  中间档 v2 卡片（单数字聚合）
  - 数据源：composable.midByNumber（来自 getMasteryByNumber 派生）
  - 形态：{ number, accuracy, total, correct, questionsCount }
  - 判定：0.5 <= accuracy < 0.8 且 total >= 3（与 AbilityCard 数字掌握度同源）
  - 展示位置：StatsDrawer（全量）

  Props:
    - data: Array<{ number, accuracy, total, correct, questionsCount }> | null
    - limit: number | null（默认 null = 不限）
    - title: string（默认 "🟢 还行"）
    - emptyText: string（默认 ""）
    - compact: boolean（默认 false）
-->
<template>
  <div class="mv2" :class="{ 'mv2--compact': compact }">
    <div v-if="!compact" class="mv2__title">{{ title }}</div>
    <div v-if="!data || data.length === 0" class="mv2__empty">
      {{ emptyText }}
    </div>
    <ol v-else class="mv2__list">
      <li
        v-for="(item, idx) in displayList"
        :key="item.number"
        class="mv2__item"
      >
        <!-- 排名: 中间档用蓝色，区别于强项绿/弱项橙 -->
        <span class="mv2__rank">{{ idx + 1 }}</span>
        <!-- 数字 -->
        <span class="mv2__num">{{ item.number }}</span>
        <!-- 标签: 中间档用 warning 黄/蓝, 不强不弱 -->
        <el-tag
          type="warning"
          size="small"
          effect="dark"
          class="mv2__tag"
        >
          {{ Math.round(item.accuracy * 100) }}% ({{ item.correct }}/{{ item.total }})
        </el-tag>
      </li>
    </ol>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  limit: { type: Number, default: null },
  title: { type: String, default: '🟢 还行' },
  emptyText: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const displayList = computed(() => {
  // props.limit 为 null 时全量展示
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})
</script>

<style scoped>
.mv2 {
  font-size: 12px;
}

.mv2__title {
  font-weight: 600;
  color: #1e3c5c;
  margin-bottom: 6px;
  font-size: 12px;
}

.mv2__empty {
  color: #909399;
  font-size: 12px;
  padding: 4px 0;
}

.mv2__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/*
 * 中间档背景色: 浅蓝色，区别于强项绿(#f0f9f4)/弱项橙(#fdf6ec)
 * 视觉上让用户一眼分辨"还行"和"拿手"+"多练习"
 */
.mv2__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #f0f6fc;
}

.mv2__rank {
  font-weight: 700;
  color: #409eff;
  min-width: 14px;
  font-size: 11px;
}

.mv2__num {
  font-family: 'Menlo', 'Consolas', monospace;
  font-weight: 700;
  color: #1e3c5c;
  font-size: 14px;
  min-width: 16px;
  text-align: center;
}

.mv2__tag {
  margin-left: auto;
}

.mv2--compact .mv2__list {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}

.mv2--compact .mv2__item {
  padding: 2px 6px;
  font-size: 11px;
}
</style>
