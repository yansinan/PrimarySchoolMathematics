<!--
  弱项 v2 卡片（单数字聚合）
  - 数据源：composable.weaknessByNumber（来自 getMasteryByNumber 派生）
  - 形态：{ number, accuracy, total, correct, questionsCount }
  - 判定：accuracy < 0.7 且 total > 0（与 AbilityCard 数字掌握度同源）
  - 3 个展示位置：StatsDrawer（全量）/ AbilityCard（top 3）/ 弹窗鼓励（用 top 1）

  Props:
    - data: Array<{ number, accuracy, total, correct, questionsCount }> | null
    - limit: number | null（默认 null = 不限）
    - title: string（默认 "⚠ 数字弱项"）
    - emptyText: string（默认 "🎉 没有数字弱项"）
    - compact: boolean（默认 false）
-->
<template>
  <div class="wv2" :class="{ 'wv2--compact': compact }">
    <div v-if="!compact" class="wv2__title">{{ title }}</div>
    <div v-if="!data || data.length === 0" class="wv2__empty">
      {{ emptyText }}
    </div>
    <ol v-else class="wv2__list">
      <li
        v-for="(item, idx) in displayList"
        :key="item.number"
        class="wv2__item"
      >
        <span class="wv2__rank">{{ idx + 1 }}</span>
        <span class="wv2__num">{{ item.number }}</span>
        <el-tag
          :type="item.accuracy < 0.5 ? 'danger' : 'warning'"
          size="small"
          effect="dark"
          class="wv2__tag"
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
  title: { type: String, default: '⚠ 数字弱项（v2 单数字聚合）' },
  emptyText: { type: String, default: '🎉 没有数字弱项，继续保持！' },
  compact: { type: Boolean, default: false },
})

const displayList = computed(() => {
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})
</script>

<style scoped>
.wv2 {
  font-size: 12px;
}

.wv2__title {
  font-weight: 600;
  color: #1e3c5c;
  margin-bottom: 6px;
  font-size: 12px;
}

.wv2__empty {
  color: #909399;
  font-size: 12px;
  padding: 4px 0;
}

.wv2__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wv2__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #fdf6ec;
}

.wv2__rank {
  font-weight: 700;
  color: #e6a23c;
  min-width: 14px;
  font-size: 11px;
}

.wv2__num {
  font-family: 'Menlo', 'Consolas', monospace;
  font-weight: 700;
  color: #1e3c5c;
  font-size: 14px;
  min-width: 16px;
  text-align: center;
}

.wv2__tag {
  margin-left: auto;
}

.wv2--compact .wv2__list {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}

.wv2--compact .wv2__item {
  padding: 2px 6px;
  font-size: 11px;
}
</style>
