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
      <span class="correct-count">✅ {{ correctCount }}</span>
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

// 简单移动端检测
const isMobile = computed(() => {
    return true;
  return window.innerWidth <= 768
})

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