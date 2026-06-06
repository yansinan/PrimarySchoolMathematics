<!--
  弱项 v2 卡片（单数字聚合）
  - 数据源：composable.weaknessByNumber（来自 getMasteryByNumber 派生）
  - 形态：{ number, accuracy, total, correct, questionsCount }
  - 判定：accuracy < 0.7 且 total > 0
  - P5: 增加游戏化进度条
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
        <div class="wv2__bar-wrap">
          <div
            class="wv2__bar"
            :style="{ width: Math.min(100, item.accuracy * 100) + '%', background: item.accuracy < 0.5 ? 'linear-gradient(90deg, #f56c6c, #e6a23c)' : 'linear-gradient(90deg, #e6a23c, #58cc71)' }"
          ></div>
        </div>
        <span class="wv2__pct">{{ Math.round(item.accuracy * 100) }}%</span>
      </li>
    </ol>
    <div v-if="data && data.length > 0" class="wv2__tip">多练练这几个数字，很快就能掌握！💪</div>
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
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 8px; background: #fdf6ec;
}
.wv2__rank { font-weight: 700; color: #e6a23c; min-width: 16px; font-size: 12px; }
.wv2__num { font-weight: 700; color: #1e3c5c; font-size: 16px; min-width: 20px; text-align: center; }
.wv2__bar-wrap {
  flex: 1; height: 10px; background: #e8e0d8; border-radius: 5px; overflow: hidden;
}
.wv2__bar { height: 100%; border-radius: 5px; transition: width 0.4s; }
.wv2__pct { font-size: 12px; font-weight: 600; color: #e6a23c; min-width: 36px; text-align: right; }
.wv2__tip { margin-top: 8px; font-size: 12px; color: #909399; text-align: center; }
.wv2--compact .wv2__list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
.wv2--compact .wv2__item { padding: 3px 8px; font-size: 12px; }
</style>
