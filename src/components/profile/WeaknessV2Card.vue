<!--
  弱项 v2 卡片 — 方案C: 迷你圆盘（36px纯色圆，颜色分级，只显示数字）
-->
<template>
  <div class="wv2" :class="{ 'wv2--compact': compact }">
    <div v-if="!compact" class="wv2__title">
      <span class="wv2__icon">📒</span> {{ title }}
    </div>
    <div v-if="!data || data.length === 0" class="wv2__empty">
      {{ emptyText }}
    </div>
    <div v-else class="wv2__list">
      <div
        v-for="item in displayList"
        :key="item.number"
        class="wv2__item"
        :class="wv2Class(item.accuracy)"
      >{{ item.number }}</div>
    </div>
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

function wv2Class(accuracy) {
  if (accuracy >= 0.95) return 'wv2__item--s'
  if (accuracy >= 0.80) return 'wv2__item--m'
  if (accuracy >= 0.50) return 'wv2__item--w'
  return 'wv2__item--d'
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
.wv2__list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; }
.wv2__item {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; color: #fff;
  flex-shrink: 0;
}
.wv2__item--s { background: #58cc71; }
.wv2__item--m { background: #409eff; }
.wv2__item--w { background: #e6a23c; }
.wv2__item--d { background: #f56c6c; }
.wv2--compact .wv2__list { gap: 4px; }
.wv2--compact .wv2__item { width: 30px; height: 30px; font-size: 13px; }
</style>
