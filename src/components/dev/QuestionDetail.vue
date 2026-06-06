<template>
  <template v-if="q">
    <div class="debug-line">
      <span class="dl">题目[equation]</span> {{ q.equation || '-' }}
      <span class="dl">| 答案[solution]</span> {{ q.solution ?? '-' }}
      <span class="dl">| 运算符[operator]</span> {{ q.operator || '-' }}
    </div>
    <div class="debug-line">
      <span class="dl">模式[inputMode]</span> {{ q.inputMode || '-' }}
      <span class="dl">| 布局[layout]</span> {{ q.layout || '-' }}
      <span class="dl">| blankMode</span> {{ q.blankMode || '-' }}
      <span class="dl">| assistLevel</span> {{ q.assistLevel ?? '-' }}
    </div>
    <div class="debug-line">
      <span class="dl">进退位[isCarry/isBorrow]</span>
      {{ q.isCarry ? '进位' : '—' }}/{{ q.isBorrow ? '退位' : '—' }}
      <span class="dl">| 难度索引[difficultyIdx]</span> {{ q.difficultyIdx ?? '-' }}
      <span class="dl">| operandMin/Max</span>
      {{ q.operandMin ?? '?' }}/{{ q.operandMax ?? '?' }}
    </div>
  </template>
</template>

<script setup>
/**
 * 题目详情展示组件（DebugPanel 使用）
 * 依赖 U 层 enrichQuestion 补全缺失字段，V 层不自行推导。
 */
import { computed } from 'vue'
import { enrichQuestion } from '@/utils/algorithm/equationParser'

const props = defineProps({ q: { type: Object, default: null } })
const q = computed(() => enrichQuestion(props.q))
</script>