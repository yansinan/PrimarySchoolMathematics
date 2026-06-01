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
          'dot-correct': answers[i-1]?.isCorrect === true,
          'dot-wrong': answers[i-1]?.isCorrect === false
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

// 简单移动端检测
const isMobile = computed(() => {
    return true;
  return window.innerWidth <= 768
})

const getStepStatus = (index) => {
  if (index < props.current) {
    return props.answers[index-1]?.isCorrect ? 'success' : 'error'
  }
  if (index === props.current) return 'process'
  return 'wait'
}
</script>

<style scoped lang="scss">
.progress-steps {
  margin-bottom: 20px;
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
  text-align: center;
  margin-top: 8px;
  font-size: 18px;
  
  .correct-count {
    color: #58cc71;
    font-weight: bold;
  }
  
  .total-count {
    color: #999;
  }
}
</style>