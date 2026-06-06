<!--
  弱项 v2 卡片 — P5: el-progress circle 替代进度条
-->
<template>
  <div class="wv2" :class="{ 'wv2--compact': compact }">
    <div v-if="!compact" class="wv2__title">
      <span class="wv2__icon">📒</span> {{ title }}
    </div>
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
        <el-progress
          type="circle"
          :percentage="Math.round(item.accuracy * 100)"
          :width="36"
          :stroke-width="4"
          :color="ringColor(item.accuracy)"
        />
      </li>
    </ol>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  limit: { type: Number, default: null },
  title: { type: String, default: '📒 多练习' },
  emptyText: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const displayList = computed(() => {
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})

function ringColor(accuracy) {
  const pct = accuracy * 100
  if (pct >= 95) return '#58cc71'
  if (pct >= 80) return '#409eff'
  if (pct >= 50) return '#e6a23c'
  return '#f56c6c'
}
</script>

<style scoped>
.wv2 { font-size: 13px; }
.wv2__title {
  font-weight: 600; color: #1e3c5c; margin-bottom: 8px; font-size: 14px;
  display: flex; align-items: center; gap: 6px;
}
.wv2__icon { font-size: 16px; }
.wv2__empty { color: #909399; font-size: 13px; padding: 6px 0; }
.wv2__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.wv2__item {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 8px; background: #fdf6ec;
}
.wv2__rank { font-weight: 700; color: #e6a23c; min-width: 16px; font-size: 12px; }
.wv2__num { font-weight: 700; color: #1e3c5c; font-size: 16px; min-width: 20px; text-align: center; }
.wv2--compact .wv2__list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
.wv2--compact .wv2__item { padding: 3px 8px; font-size: 12px; }
</style>
