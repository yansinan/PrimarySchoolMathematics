<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <!-- 头部暂时用简单文字代替 -->
    <el-header class="simple-header">
      <span class="stage-badge">{{ currentStage }}</span>
      <span class="streak-badge" v-if="session.streak > 0">🔥 {{ session.streak }}</span>
    
    <!-- 进度组件 -->
    <ProgressSteps
      :total="totalQuestions"
      :current="currentIndex + 1"
      :answers="session.answers"
      :correct-count="correctCount"
    />
    </el-header>
    
    <!-- 题目展示区域 - 动态组件 -->
    <el-main class="question-area">
      <component
        :is="currentLayout"
        :show-answer="session.feedbackType !== null"
        :answer="currentQuestion.solution"
        :user-answer="session.currentAnswer"
        :enable-direct-input="session.displayMode.input === 'keypad' && session.feedbackType === null"
        :class="{
          'correct-flash': session.feedbackType === 'correct',
          'wrong-flash': session.feedbackType === 'wrong'
        }"
        @update:user-answer="handleInput"
        @submit-answer="handleSubmit"
      />
      </el-main>
    
    <!-- 输入区域 - 动态组件 -->
    <component
      :is="currentInput"
      v-bind="inputProps"
      @input="handleInput"
      @select="handleSelect"
      @backspace="handleBackspace"
      @submit="handleSubmit"
      @next="handleNext"
    />
  </el-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

// 组件导入
import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import { getCarryType, parseEquation } from '@/utils/equationParser'

// ============ 临时对象代替services ============


import { usePracticeStore } from '@/stores/practice'
// 界面操作参数
const practiceStore = usePracticeStore()
// 监听事件变化
import { storeToRefs } from 'pinia'
const {
  listPractices,
  totalQuestions,
  session,
  currentIndex,
  currentQuestion,
  isLastQuestion,
  correctCount
} = storeToRefs(practiceStore) // 所有题目 [{ equation, solution }]

// 临时展示策略
const tempDisplayStrategy = {
  stats: {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  },
  
  decide(equation) {
    // 简单决策逻辑
    if (this.stats.consecutiveWrong >= 3) {
      return { layout: 'horizontal', input: 'options' }
    }
    
    // 进位/退位题用竖式
    const parsedEquation = parseEquation(equation)
    if (getCarryType(parsedEquation)) {
      return { layout: 'vertical', input: 'keypad' }
    }
    
    // 默认用横式+键盘
    return { layout: 'horizontal', input: 'keypad' }
  },
  
  updateStats(isCorrect) {
    if (isCorrect) {
      this.stats.consecutiveWrong = 0
      this.stats.accuracyRate = this.stats.accuracyRate * 0.9 + 0.1
    } else {
      this.stats.consecutiveWrong++
      this.stats.accuracyRate = this.stats.accuracyRate * 0.9
    }
  }
}

// ============ 状态定义 ============

// 用户信息
const currentStage = ref('一年级')

// 题目相关
// const totalQuestions = ref(10)       // 总题数

// ============ 计算属性 ============

// 动态组件映射
const layoutComponents = {
  horizontal: HorizontalLayout,
  vertical: VerticalLayout
}

const inputComponents = {
  keypad: NumberKeypad,
  options: OptionButtons
}

const currentLayout = computed(() => layoutComponents[session.value.displayMode.layout])
const currentInput = computed(() => inputComponents[session.value.displayMode.input])

// 传递给输入组件的属性
const inputProps = computed(() => {
  const baseProps = {
    disabled: session.value.feedbackType !== null,
    showResult: session.value.feedbackType !== null
  }
  
  if (session.value.displayMode.input === 'keypad') {
    return {
      ...baseProps,
      currentValue: session.value.currentAnswer
    }
  } else {
    return {
      ...baseProps,
      options: session.value.currentOptions,
      correctAnswer: currentQuestion.value.solution,
      selectedOption: session.value.selectedOption
    }
  }
})

// ============ 方法定义 ============

// 初始化练习
const initPractice = () => {

  // 重置状态
  practiceStore.resetPracticeSession()
  
  // 重置策略统计
  tempDisplayStrategy.stats = {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  }
  
  // 初始化展示模式
  const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)
  session.value.displayMode = mode
  
  // 如果是选择题模式，生成选项
  if (mode.input === 'options') {
    generateOptions(currentQuestion.value.solution)
  }
}

// 生成选择题选项
const generateOptions = (correct) => {
  const options = [correct]
  while (options.length < 4) {
    const offset = Math.floor(Math.random() * 5) + 1
    const wrong = correct + (Math.random() > 0.5 ? offset : -offset)
    if (wrong > 0 && !options.includes(wrong)) {
      options.push(wrong)
    }
  }
  // 打乱顺序
  session.value.currentOptions = options.sort(() => Math.random() - 0.5)
}

// 处理输入
const handleInput = (value) => {
  session.value.currentAnswer = value
}

const handleBackspace = () => {
  session.value.currentAnswer = session.value.currentAnswer.slice(0, -1)
}

const handleSelect = (option) => {
  session.value.selectedOption = option
  handleSubmit(option)
}

// 提交答案
const handleSubmit = (answer) => {
  const userAnswer = answer !== undefined ? answer : Number(session.value.currentAnswer)
  
  if (isNaN(userAnswer)) {
    ElMessage.warning('请输入答案')
    return
  }
  
  const isCorrect = userAnswer === currentQuestion.value.solution
  
  // 记录答案
  session.value.answers.push({
    ...currentQuestion.value,
    userAnswer,
    isCorrect,
    timestamp: Date.now()
  })
  
  // 更新连续正确数
  if (isCorrect) {
    session.value.streak++
    session.value.feedbackType = 'correct'
    ElMessage.success({
      message: '✓ 正确！',
      duration: 800,
      offset: 100,
      customClass: 'feedback-message'
    })
    
    // 正确后自动进入下一题
    setTimeout(() => {
      handleNext()
    }, 800)
  } else {
    session.value.streak = 0
    session.value.feedbackType = 'wrong'
    ElMessage.error({
      message: `✗ 正确答案是 ${currentQuestion.value.solution}`,
      duration: 1500,
      offset: 100,
      customClass: 'feedback-message'
    })
    
    // 错误后短暂停留
    setTimeout(() => {
      if (session.value.displayMode.input === 'keypad') {
        session.value.feedbackType = null  // 键盘模式清除反馈，可重新输入
      }
    }, 1500)
  }
  
  // 更新策略的统计
  tempDisplayStrategy.updateStats(isCorrect)
}

// 下一题
const handleNext = () => {
  if (!isLastQuestion.value) {
    // 还有下一题
    practiceStore.nextQuestion()
    
    // 重置状态
    practiceStore.resetQuestionInputState()
    
    // 重新决策展示模式
    const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)
    session.value.displayMode = mode
    
    // 如果是选择题模式，生成新选项
    if (mode.input === 'options') {
      generateOptions(currentQuestion.value.solution)
    }
  } else {
    // 练习完成
    ElMessage.success('恭喜！完成所有题目！')
    console.log('练习完成', {
      total: totalQuestions.value,
      correct: correctCount.value,
      answers: answers.value
    })
  }
}

// ============ 生命周期 ============

// 监听题目变化（用于调试）
watch(currentQuestion, (newQ) => {
  console.log('当前题目:', newQ)
})
watch(listPractices, (newPracticeList) => {
  if (newPracticeList.length > 0) {
    initPractice()
  }
}, { immediate: true })
</script>

<style scoped>
.practice-view {
  max-width: 800px;
  width: 60%;
  margin: 0 auto;
  background-color: #f8f9fa;
}

.simple-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid #e9ecef;
}

.stage-badge {
  font-size: 1.2rem;
  font-weight: 600;
  color: #1e3c5c;
  background-color: #e9ecef;
  padding: 4px 12px;
  border-radius: 20px;
}

.streak-badge {
  font-size: 1.2rem;
  font-weight: 600;
  color: #e67e22;
  background-color: #fff3e0;
  padding: 4px 12px;
  border-radius: 20px;
}

.question-area {
  align-items: center;
  margin: 20px 0;
}

.correct-flash {
  animation: correctFlash 0.5s ease;
}

.wrong-flash {
  animation: wrongFlash 0.5s ease;
}

@keyframes correctFlash {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); color: #58cc71; }
  100% { transform: scale(1); }
}

@keyframes wrongFlash {
  0% { transform: translateX(0); }
  20% { transform: translateX(-10px); }
  40% { transform: translateX(10px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(5px); }
  100% { transform: translateX(0); }
}
</style>

<style>
.feedback-message {
  font-size: 24px !important;
  padding: 16px 32px !important;
  border-radius: 50px !important;
  font-weight: bold !important;
  text-align: center !important;
  z-index: 9999 !important;
}
</style>