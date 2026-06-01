<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <el-card class="practice-card" shadow="never">
        <div class="practice-card__header">
          <div class="stage-badge">{{ currentStage }}</div>
          <div class="streak-badge" v-if="session.streak > 0">🔥 {{ session.streak }}</div>
        </div>

        <ProgressSteps
          :total="totalQuestions"
          :current="currentIndex + 1"
          :answers="session.answers"
          :correct-count="correctCount"
        />

        <div class="question-area">
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
        </div>

        <div class="input-area">
          <component
            :is="currentInput"
            v-bind="inputProps"
            @input="handleInput"
            @select="handleSelect"
            @backspace="handleBackspace"
            @submit="handleSubmit"
            @next="handleNext"
          />
        </div>
      </el-card>
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import { getCarryType, parseEquation } from '@/utils/equationParser'

import { usePracticeStore } from '@/stores/practice'
import { storeToRefs } from 'pinia'

const practiceStore = usePracticeStore()
const {
  listPractices,
  totalQuestions,
  session,
  currentIndex,
  currentQuestion,
  isLastQuestion,
  correctCount
} = storeToRefs(practiceStore)

const tempDisplayStrategy = {
  stats: {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  },
  decide(equation) {
    if (this.stats.consecutiveWrong >= 3) {
      return { layout: 'horizontal', input: 'options' }
    }

    const parsedEquation = parseEquation(equation)
    if (getCarryType(parsedEquation)) {
      return { layout: 'vertical', input: 'keypad' }
    }

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

const currentStage = ref('一年级')

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
  }

  return {
    ...baseProps,
    options: session.value.currentOptions,
    correctAnswer: currentQuestion.value.solution,
    selectedOption: session.value.selectedOption
  }
})

const initPractice = () => {
  practiceStore.resetPracticeSession()

  tempDisplayStrategy.stats = {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  }

  const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)
  session.value.displayMode = mode

  if (mode.input === 'options') {
    generateOptions(currentQuestion.value.solution)
  }
}

const generateOptions = (correct) => {
  const options = [correct]
  while (options.length < 4) {
    const offset = Math.floor(Math.random() * 5) + 1
    const wrong = correct + (Math.random() > 0.5 ? offset : -offset)
    if (wrong > 0 && !options.includes(wrong)) {
      options.push(wrong)
    }
  }
  session.value.currentOptions = options.sort(() => Math.random() - 0.5)
}

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

const handleSubmit = (answer) => {
  const userAnswer = answer !== undefined ? answer : Number(session.value.currentAnswer)

  if (isNaN(userAnswer)) {
    ElMessage.warning('请输入答案')
    return
  }

  const isCorrect = userAnswer === currentQuestion.value.solution

  session.value.answers.push({
    ...currentQuestion.value,
    userAnswer,
    isCorrect,
    timestamp: Date.now()
  })

  if (isCorrect) {
    session.value.streak++
    session.value.feedbackType = 'correct'
    ElMessage.success({
      message: '✓ 正确！',
      duration: 800,
      offset: 100,
      customClass: 'feedback-message'
    })

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

    setTimeout(() => {
      if (session.value.displayMode.input === 'keypad') {
        session.value.feedbackType = null
      }
    }, 1500)
  }

  tempDisplayStrategy.updateStats(isCorrect)
}

const handleNext = () => {
  if (!isLastQuestion.value) {
    practiceStore.nextQuestion()
    practiceStore.resetQuestionInputState()

    const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)
    session.value.displayMode = mode

    if (mode.input === 'options') {
      generateOptions(currentQuestion.value.solution)
    }
  } else {
    ElMessage.success('恭喜！完成所有题目！')
    console.log('练习完成', {
      total: totalQuestions.value,
      correct: correctCount.value
    })
  }
}

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
  width: 100%;
  min-height: calc(100dvh - 16px);
}

.practice-shell {
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.practice-card {
  width: min(100%, 980px);
  border: 0;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 32px rgba(23, 110, 191, 0.08);
}

.practice-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.stage-badge,
.streak-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 14px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid #dbe7f4;
}

.stage-badge {
  color: #1e3c5c;
  background: #e9f4ff;
}

.streak-badge {
  color: #d97706;
  background: #fff7ed;
}

.question-area {
  margin-top: 8px;
}

.input-area {
  margin-top: 14px;
}

.correct-flash {
  animation: correctFlash 0.5s ease;
}

.wrong-flash {
  animation: wrongFlash 0.5s ease;
}

@keyframes correctFlash {
  0% { transform: scale(1); }
  50% { transform: scale(1.03); color: #58cc71; }
  100% { transform: scale(1); }
}

@keyframes wrongFlash {
  0% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}

@media (max-width: 1024px) {
  .practice-card {
    width: 100%;
    border-radius: 20px;
  }
}

@media (max-width: 768px) {
  .practice-card {
    border-radius: 18px;
    padding: 8px 6px;
  }

  .practice-card__header {
    margin-bottom: 8px;
  }

  .input-area {
    margin-top: 12px;
  }
}

@media (max-width: 480px) {
  .practice-card {
    border-radius: 16px;
    padding: 6px 4px;
  }

  .stage-badge,
  .streak-badge {
    padding: 5px 10px;
    font-size: 14px;
  }
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