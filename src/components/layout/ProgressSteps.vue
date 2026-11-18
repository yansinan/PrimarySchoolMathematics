<!-- components/layout/ProgressSteps.vue -->
<template>
  <div class="progress-steps">
    <!-- 移动端用圆点进度 -->
    <div v-if="isMobile" class="dots-progress">
      <span 
        v-for="i in total" 
        :key="i"
        class="dot"
        :class="{
          'dot-active': i <= current,
          'dot-correct': answers[i-1] && isCorrect(answers[i-1]),
          'dot-wrong': answers[i-1] && !isCorrect(answers[i-1])
        }"
      ></span>
    </div>
    
    <!-- PC端用el-steps -->
    <el-steps 
      v-else 
      :active="current" 
      finish-status="success"
      simple
    >
      <el-step 
        v-for="i in total" 
        :key="i"
        :title="`第${i}题`"
        :status="getStepStatus(i)"
      />
    </el-steps>
    
    <div class="stats-text">
      <span class="correct-count">✅ {{ correctCountRounded }}</span>
      <span class="total-count">/ {{ total }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

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

// 响应式断点：窄屏用圆点进度，宽屏用 el-steps。
// 原实现是 `return true; return window.innerWidth <= 768`（硬编码 true，
// 第二行永不执行），导致 PC 上永远显示圆点条。
const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)
const onResize = () => { viewportWidth.value = window.innerWidth }

onMounted(() => {
  viewportWidth.value = window.innerWidth
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => window.removeEventListener('resize', onResize))

const isMobile = computed(() => viewportWidth.value <= 768)

const getStepStatus = (index) => {
  if (index < props.current) {
    return props.answers[index-1] && isCorrect(props.answers[index-1]) ? 'success' : 'error'
  }
  if (index === props.current) return 'process'
  return 'wait'
}
</script>

<style scoped lang="scss">
.progress-steps {
  margin-bottom: 14px;
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
  .dots-progress {
    gap: 5px;
  }
  .stats-text {
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
  .dots-progress {
    gap: 4px;
  }
  .stats-text {
    margin-top: 2px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .progress-steps {
    margin-bottom: 10px;
  }

  .dots-progress {
    gap: 6px;
  }

  .dot {
    width: 10px;
    height: 10px;
  }

  .stats-text {
    font-size: 15px;
  }
}
</style>