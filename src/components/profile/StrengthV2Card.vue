<!--
  强项 v2 卡片（单数字聚合）
  - 数据源：composable.strengthByNumber（来自 getMasteryByNumber 派生）
  - 形态：{ number, accuracy, total, correct, questionsCount }
  - 判定：accuracy >= 0.8 且 total >= 3
  - 3 个展示位置：StatsDrawer（全量）/ AbilityCard（top 3）/ 弹窗鼓励（top 3 → "4、5、9 的运算是你最拿手的！"）

  Props:
    - data: Array<{ number, accuracy, total, correct, questionsCount }> | null
    - limit: number | null（默认 null）
    - title: string（默认 "✓ 数字强项"）
    - emptyText: string（默认 "💪 继续练习，数字强项马上出现"）
    - compact: boolean
    - showNumber: boolean（默认 true；false 时用作文案生成器）
-->
<template>
  <div class="sv2" :class="{ 'sv2--compact': compact }">
    <div v-if="!compact" class="sv2__title">{{ title }}</div>
    <div v-if="!data || data.length === 0" class="sv2__empty">
      {{ emptyText }}
    </div>
    <ol v-else class="sv2__list">
      <li
        v-for="(item, idx) in displayList"
        :key="item.number"
        class="sv2__item"
      >
        <span class="sv2__rank">{{ idx + 1 }}</span>
        <span class="sv2__num">{{ item.number }}</span>
        <el-tag
          type="success"
          size="small"
          effect="dark"
          class="sv2__tag"
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
  title: { type: String, default: '✓ 数字强项（v2 单数字聚合）' },
  emptyText: { type: String, default: '💪 继续练习，数字强项马上出现' },
  compact: { type: Boolean, default: false },
})

const displayList = computed(() => {
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})
</script>

<style scoped>
.sv2 {
  font-size: 12px;
}

.sv2__title {
  font-weight: 600;
  color: #1e3c5c;
  margin-bottom: 6px;
  font-size: 12px;
}

.sv2__empty {
  color: #909399;
  font-size: 12px;
  padding: 4px 0;
}

.sv2__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sv2__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #f0f9f4;
}

.sv2__rank {
  font-weight: 700;
  color: #27ae60;
  min-width: 14px;
  font-size: 11px;
}

.sv2__num {
  font-family: 'Menlo', 'Consolas', monospace;
  font-weight: 700;
  color: #1e3c5c;
  font-size: 14px;
  min-width: 16px;
  text-align: center;
}

.sv2__tag {
  margin-left: auto;
}

.sv2--compact .sv2__list {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}

.sv2--compact .sv2__item {
  padding: 2px 6px;
  font-size: 11px;
}
</style>
