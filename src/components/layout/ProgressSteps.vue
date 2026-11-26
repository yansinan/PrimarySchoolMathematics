<!-- components/layout/ProgressSteps.vue -->
<template>
  <div class="progress-steps">
    <!-- 题数多（>10）：细条 + 当前/总数。逐题格子在这个量级必然溢出，且孩子数不过来 -->
    <div v-if="useBar" class="bar-progress" role="progressbar"
      :aria-valuenow="current" :aria-valuemin="1" :aria-valuemax="total">
      <div class="bar-track">
        <span v-for="(seg, i) in barSegments" :key="i" class="bar-seg"
          :class="`bar-seg--${seg}`"></span>
      </div>
      <span class="bar-text"><b>{{ current }}</b> / {{ total }}</span>
    </div>

    <!-- 题数少（≤10）：一排数字小格，一格一题。
         不用 el-steps —— 它的 simple 模式在 8~10 题时会把「第1题」挤成竖排文字。 -->
    <div v-else class="step-chips">
      <span
        v-for="i in total"
        :key="i"
        class="step-chip"
        :class="chipClass(i)"
        :title="`第 ${i} 题`"
      >{{ i }}</span>
    </div>

    <div class="stats-text">
      <span class="correct-count">✅ {{ correctCountRounded }}</span>
      <span class="total-count">/ {{ total }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  total: Number,
  current: Number,        // 当前题号（从1开始）
  answers: Array,         // 答题记录 [{ isCorrect }]
  correctCount: Number
})

/** 用 getter（userAnswer===solution）判断对错，不依赖 stored isCorrect 字段 */
const isCorrect = (a) => a ? Number(a.userAnswer) === Number(a.solution) : false

/**
 * 显示的「答对题数」。
 * 不能用 correctCount（那是 Answer.sumScores() 的掌握分：一次答对=1，错两次再对=0.333），
 * 直接显示会出现 "✅ 4.667 / 8" 或四舍五入成 0。这里按当前组答案逐题判对错。
 */
const correctCountRounded = computed(() => {
  const arr = Array.isArray(props.answers) ? props.answers : []
  return arr.filter(a => isCorrect(a)).length
})



/** 超过这个题数就换成细条：10 个逐题格子是卡片宽度的上限 */
const BAR_THRESHOLD = 10
const useBar = computed(() => (props.total || 0) > BAR_THRESHOLD)

/**
 * 细条分段着色：已答的按对错上色，未答灰色
 * @returns {Array<'ok'|'bad'|'todo'>} 长度 = total
 */
const barSegments = computed(() => {
  const total = props.total || 0
  const arr = Array.isArray(props.answers) ? props.answers : []
  const out = []
  for (let i = 0; i < total; i++) {
    const a = arr[i]
    if (!a) out.push('todo')
    else out.push(isCorrect(a) ? 'ok' : 'bad')
  }
  return out
})

/** 数字小格的状态：已答对 / 已答错 / 当前 / 未答 */
function chipClass(i) {
  const a = Array.isArray(props.answers) ? props.answers[i - 1] : null
  if (a) return isCorrect(a) ? 'step-chip--ok' : 'step-chip--bad'
  if (i === props.current) return 'step-chip--cur'
  return ''
}
</script>

<style scoped lang="scss">
.progress-steps {
  margin-bottom: 14px;
}

/* 细条进度：长度与题数无关，30 题也不会溢出 */
.bar-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-track {
  flex: 1 1 auto;
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: #eef3f8;
}

.bar-seg {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  transition: background-color 0.2s;
}

.bar-seg--ok {
  background: #58cc71;
}

.bar-seg--bad {
  background: #ff8a8a;
}

.bar-seg--todo {
  background: #e4ecf4;
}

.bar-text {
  flex: 0 0 auto;
  font-size: 12.5px;
  color: #8794a2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-text b {
  font-size: 14px;
  color: #176ebf;
}

/* 一排数字小格：宽度自适应，放不下时自动缩小，不换行 */
.step-chips {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.step-chip {
  flex: 0 0 auto;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #8794a2;
  background: #f2f6fa;
  border: 1px solid transparent;
}

.step-chip--ok {
  color: #2f9e5c;
  background: #e5f7ea;
}

.step-chip--bad {
  color: #e05252;
  background: #fdeaea;
}

.step-chip--cur {
  color: #fff;
  background: #1cb0f6;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.35);
}

/* 窄屏收紧间距，10 题也能一行放下 */
@media (max-width: 420px) {
  .step-chips {
    gap: 4px;
  }

  .step-chip {
    min-width: 22px;
    height: 24px;
    padding: 0 4px;
    font-size: 11.5px;
  }
}

.dots-progress {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #e0e0e0;
  transition: all 0.3s;
  
  &-active {
    background-color: #1cb0f6;
    transform: scale(1.2);
  }
  
  &-correct {
    background-color: #58cc71;
  }
  
  &-wrong {
    background-color: #ff4b4b;
  }
}

.stats-text {
  white-space: nowrap;
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 2px;
  margin-top: 8px;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  
  .correct-count {
    color: #58cc71;
    font-weight: bold;
  }
  
  .total-count {
    color: #999;
  }
}

@media (max-width: 768px) {
  .progress-steps {
    margin-bottom: 12px;
  }

  .stats-text {
  white-space: nowrap;
    margin-top: 6px;
    font-size: 16px;
  }
}

/* ── Short viewport height ── */
@media (max-height: 800px) {
  .progress-steps {
    margin-bottom: 6px;
  }
  .dot {
    width: 10px;
    height: 10px;
  }
  /* 细条进度：长度与题数无关，30 题也不会溢出 */
.bar-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-track {
  flex: 1 1 auto;
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: #eef3f8;
}

.bar-seg {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  transition: background-color 0.2s;
}

.bar-seg--ok {
  background: #58cc71;
}

.bar-seg--bad {
  background: #ff8a8a;
}

.bar-seg--todo {
  background: #e4ecf4;
}

.bar-text {
  flex: 0 0 auto;
  font-size: 12.5px;
  color: #8794a2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-text b {
  font-size: 14px;
  color: #176ebf;
}

/* 一排数字小格：宽度自适应，放不下时自动缩小，不换行 */
.step-chips {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.step-chip {
  flex: 0 0 auto;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #8794a2;
  background: #f2f6fa;
  border: 1px solid transparent;
}

.step-chip--ok {
  color: #2f9e5c;
  background: #e5f7ea;
}

.step-chip--bad {
  color: #e05252;
  background: #fdeaea;
}

.step-chip--cur {
  color: #fff;
  background: #1cb0f6;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.35);
}

/* 窄屏收紧间距，10 题也能一行放下 */
@media (max-width: 420px) {
  .step-chips {
    gap: 4px;
  }

  .step-chip {
    min-width: 22px;
    height: 24px;
    padding: 0 4px;
    font-size: 11.5px;
  }
}

.dots-progress {
    gap: 5px;
  }
  .stats-text {
  white-space: nowrap;
    margin-top: 4px;
    font-size: 15px;
  }
}

@media (max-height: 600px) {
  .progress-steps {
    margin-bottom: 3px;
  }
  .dot {
    width: 8px;
    height: 8px;
  }
  /* 细条进度：长度与题数无关，30 题也不会溢出 */
.bar-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-track {
  flex: 1 1 auto;
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: #eef3f8;
}

.bar-seg {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  transition: background-color 0.2s;
}

.bar-seg--ok {
  background: #58cc71;
}

.bar-seg--bad {
  background: #ff8a8a;
}

.bar-seg--todo {
  background: #e4ecf4;
}

.bar-text {
  flex: 0 0 auto;
  font-size: 12.5px;
  color: #8794a2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-text b {
  font-size: 14px;
  color: #176ebf;
}

/* 一排数字小格：宽度自适应，放不下时自动缩小，不换行 */
.step-chips {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.step-chip {
  flex: 0 0 auto;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #8794a2;
  background: #f2f6fa;
  border: 1px solid transparent;
}

.step-chip--ok {
  color: #2f9e5c;
  background: #e5f7ea;
}

.step-chip--bad {
  color: #e05252;
  background: #fdeaea;
}

.step-chip--cur {
  color: #fff;
  background: #1cb0f6;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.35);
}

/* 窄屏收紧间距，10 题也能一行放下 */
@media (max-width: 420px) {
  .step-chips {
    gap: 4px;
  }

  .step-chip {
    min-width: 22px;
    height: 24px;
    padding: 0 4px;
    font-size: 11.5px;
  }
}

.dots-progress {
    gap: 4px;
  }
  .stats-text {
  white-space: nowrap;
    margin-top: 2px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .progress-steps {
    margin-bottom: 10px;
  }

  /* 细条进度：长度与题数无关，30 题也不会溢出 */
.bar-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-track {
  flex: 1 1 auto;
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: #eef3f8;
}

.bar-seg {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  transition: background-color 0.2s;
}

.bar-seg--ok {
  background: #58cc71;
}

.bar-seg--bad {
  background: #ff8a8a;
}

.bar-seg--todo {
  background: #e4ecf4;
}

.bar-text {
  flex: 0 0 auto;
  font-size: 12.5px;
  color: #8794a2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-text b {
  font-size: 14px;
  color: #176ebf;
}

/* 一排数字小格：宽度自适应，放不下时自动缩小，不换行 */
.step-chips {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.step-chip {
  flex: 0 0 auto;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #8794a2;
  background: #f2f6fa;
  border: 1px solid transparent;
}

.step-chip--ok {
  color: #2f9e5c;
  background: #e5f7ea;
}

.step-chip--bad {
  color: #e05252;
  background: #fdeaea;
}

.step-chip--cur {
  color: #fff;
  background: #1cb0f6;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.35);
}

/* 窄屏收紧间距，10 题也能一行放下 */
@media (max-width: 420px) {
  .step-chips {
    gap: 4px;
  }

  .step-chip {
    min-width: 22px;
    height: 24px;
    padding: 0 4px;
    font-size: 11.5px;
  }
}

.dots-progress {
    gap: 6px;
  }

  .dot {
    width: 10px;
    height: 10px;
  }

  .stats-text {
  white-space: nowrap;
    font-size: 15px;
  }
}
</style>