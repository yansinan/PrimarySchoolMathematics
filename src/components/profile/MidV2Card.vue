<!--
  中间档 v2 卡片 — 方案C: 迷你圆盘（36px纯色圆，颜色分级，只显示数字）
-->
<template>
  <div class="mv2" :class="{ 'mv2--compact': compact }">
    <div v-if="!compact" class="mv2__title">
      <span class="mv2__icon">🟢</span> {{ title }}
    </div>
    <div v-if="!data || data.length === 0" class="mv2__empty">
      {{ emptyText }}
    </div>
    <div v-else class="mv2__list">
      <div
        v-for="item in displayList"
        :key="item.number"
        class="mv2__item"
        :class="mv2Class(item.accuracy)"
      >{{ item.number }}</div>
    </div>
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
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})

function mv2Class(accuracy) {
  if (accuracy >= 0.95) return 'mv2__item--s'
  if (accuracy >= 0.80) return 'mv2__item--m'
  if (accuracy >= 0.50) return 'mv2__item--w'
  return 'mv2__item--d'
}
</script>

<style scoped>
.mv2 { font-size: 13px; }
.mv2__title {
  font-weight: 600; color: #1e3c5c; margin-bottom: 8px; font-size: 14px;
  display: flex; align-items: center; gap: 6px;
}
.mv2__icon { font-size: 16px; }
.mv2__empty { color: #909399; font-size: 13px; padding: 6px 0; }
.mv2__list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; }
.mv2__item {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; color: #fff;
  flex-shrink: 0;
}
.mv2__item--s { background: #58cc71; }
.mv2__item--m { background: #409eff; }
.mv2__item--w { background: #e6a23c; }
.mv2__item--d { background: #f56c6c; }
.mv2--compact .mv2__list { gap: 4px; }
.mv2--compact .mv2__item { width: 30px; height: 30px; font-size: 13px; }
</style>
