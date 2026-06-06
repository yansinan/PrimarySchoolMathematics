<!--
  中间档 v2 卡片（单数字聚合）
  - 数据源：composable.midByNumber（来自 getMasteryByNumber 派生）
  - P5: 增加游戏化进度条
-->
<template>
  <div class="mv2" :class="{ 'mv2--compact': compact }">
    <div v-if="!compact" class="mv2__title">
      <span class="mv2__icon">🟢</span> {{ title }}
    </div>
    <div v-if="!data || data.length === 0" class="mv2__empty">
      {{ emptyText }}
    </div>
    <ol v-else class="mv2__list">
      <li
        v-for="(item, idx) in displayList"
        :key="item.number"
        class="mv2__item"
      >
        <span class="mv2__rank">{{ idx + 1 }}</span>
        <span class="mv2__num">{{ item.number }}</span>
        <div class="mv2__bar-wrap">
          <div
            class="mv2__bar"
            :style="{ width: Math.min(100, item.accuracy * 100) + '%' }"
          ></div>
        </div>
        <span class="mv2__pct">{{ Math.round(item.accuracy * 100) }}%</span>
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
  if (!props.data) return []
  if (props.limit == null) return props.data
  return props.data.slice(0, props.limit)
})
</script>

<style scoped>
.mv2 { font-size: 13px; }
.mv2__title {
  font-weight: 600; color: #1e3c5c; margin-bottom: 8px; font-size: 14px;
  display: flex; align-items: center; gap: 6px;
}
.mv2__icon { font-size: 16px; }
.mv2__empty { color: #909399; font-size: 13px; padding: 6px 0; }
.mv2__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.mv2__item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 8px; background: #f0f6fc;
}
.mv2__rank { font-weight: 700; color: #409eff; min-width: 16px; font-size: 12px; }
.mv2__num { font-weight: 700; color: #1e3c5c; font-size: 16px; min-width: 20px; text-align: center; }
.mv2__bar-wrap {
  flex: 1; height: 10px; background: #e0e8f0; border-radius: 5px; overflow: hidden;
}
.mv2__bar { height: 100%; background: linear-gradient(90deg, #409eff, #58cc71); border-radius: 5px; transition: width 0.4s; }
.mv2__pct { font-size: 12px; font-weight: 600; color: #409eff; min-width: 36px; text-align: right; }
.mv2--compact .mv2__list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
.mv2--compact .mv2__item { padding: 3px 8px; font-size: 12px; }
</style>
