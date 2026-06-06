<!--
  强项 v2 卡片（单数字聚合）
  - 数据源：composable.strengthByNumber（来自 getMasteryByNumber 派生）
  - 形态：{ number, accuracy, total, correct, questionsCount }
  - 判定：accuracy >= 0.8 且 total >= 3
  - P5: 增加游戏化进度条
-->
<template>
  <div class="sv2" :class="{ 'sv2--compact': compact }">
    <div v-if="!compact" class="sv2__title">
      <span class="sv2__icon">🌟</span> {{ title }}
    </div>
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
        <div class="sv2__bar-wrap">
          <div
            class="sv2__bar"
            :style="{ width: Math.min(100, item.accuracy * 100) + '%' }"
          ></div>
        </div>
        <span class="sv2__pct">{{ Math.round(item.accuracy * 100) }}%</span>
      </li>
    </ol>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  limit: { type: Number, default: null },
  title: { type: String, default: '🌟 你最拿手' },
  emptyText: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const displayList = computed(() => {
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})
</script>

<style scoped>
.sv2 { font-size: 13px; }
.sv2__title {
  font-weight: 600; color: #1e3c5c; margin-bottom: 8px; font-size: 14px;
  display: flex; align-items: center; gap: 6px;
}
.sv2__icon { font-size: 16px; }
.sv2__empty { color: #909399; font-size: 13px; padding: 6px 0; }
.sv2__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.sv2__item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 8px; background: #f0f9f4;
}
.sv2__rank { font-weight: 700; color: #27ae60; min-width: 16px; font-size: 12px; }
.sv2__num { font-weight: 700; color: #1e3c5c; font-size: 16px; min-width: 20px; text-align: center; }
.sv2__bar-wrap {
  flex: 1; height: 10px; background: #e0e8f0; border-radius: 5px; overflow: hidden;
}
.sv2__bar { height: 100%; background: linear-gradient(90deg, #58cc71, #27ae60); border-radius: 5px; transition: width 0.4s; }
.sv2__pct { font-size: 12px; font-weight: 600; color: #27ae60; min-width: 36px; text-align: right; }
.sv2--compact .sv2__list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
.sv2--compact .sv2__item { padding: 3px 8px; font-size: 12px; }
</style>
