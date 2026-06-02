<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <el-card class="practice-card" shadow="never" v-if="currentQuestion !== null">
        <div class="practice-card__header">
          <div class="stage-badge" :class="{ 'stage-badge--assessment': isAssessment }">{{ currentStage }}</div>
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
            ref="layoutRef"
            :is="currentLayout"
            :show-answer="session.feedbackType !== null"
            :answer="currentQuestion.solution"
            :user-answer="session.currentAnswer"
            :enable-direct-input="session.displayMode.input === 'keypad' && session.feedbackType === null"
            :digit-mode="session.displayMode.layout === 'vertical' && session.displayMode.input === 'keypad'"
            :focus-slot="digitFocusIdx"
            :class="{
              'correct-flash': session.feedbackType === 'correct',
              'wrong-flash': session.feedbackType === 'wrong'
            }"
            @update:user-answer="handleInput"
            @submit-answer="handleSubmit"
            @focus="digitFocusIdx = $event"
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

      <!-- 加载中：诊断题目生成中 -->
      <el-card class="practice-card practice-card--loading" shadow="never" v-else>
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在生成能力评估题目…</p>
        </div>
      </el-card>
    </el-main>
  </el-container>

  <!-- ── Floating stats button ── -->
  <el-tooltip content="练习统计" placement="left">
    <el-button
      class="stats-fab"
      :icon="TrendCharts"
      size="large"
      circle
      @click="statsStore.toggleDrawer()"
    />
  </el-tooltip>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { TrendCharts } from '@element-plus/icons-vue'

import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import { getCarryType, parseEquation } from '@/utils/equationParser'
import { generateDiagnosticQuestions, analyzeAbility, generatePracticeConfig } from '@/utils/diagnostic'
import { createFormulasGenerator } from '@/utils/paperGenerator'
import { EquationSolver } from '@/utils/EquationSolver'
import { createAdaptiveEngine, getDifficultyConfig, getGroupSize, evaluateGroup, getDifficultyLabel, diversifyBatch } from '@/utils/adaptiveEngine'
import { formatDuration } from '@/utils/timeFormat'

import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { storeToRefs } from 'pinia'

const practiceStore = usePracticeStore()
const statsStore = useStatsStore()
const {
  listPractices,
  totalQuestions,
  session,
  currentIndex,
  currentQuestion,
  isLastQuestion,
  correctCount,
  isAssessment,
  isPractice,
  isIdle,
  phase,
  abilityProfile
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

/** 自适应引擎状态 */
const adaptiveEngine = ref(null)
const adaptiveGroupIndex = ref(0)
/** 避免 handleNext 重复调用（choice 模式下 下一题按钮 + setTimeout 同时触发）*/
let nextLocked = false

const currentStage = computed(() => {
  if (isAssessment.value) {
    return `能力评估 ${session.value.answers.length}/${totalQuestions.value}`
  }
  if (adaptiveEngine.value) {
    const label = getDifficultyLabel(adaptiveEngine.value)
    const groupIdx = adaptiveGroupIndex.value
    return `${label} · 第${groupIdx}组`
  }
  if (abilityProfile.value) {
    return '智能练习'
  }
  return '一年级'
})

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
  if (!currentQuestion.value) return { disabled: true }

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
  if (!currentQuestion.value) return

  practiceStore.resetPracticeSession()
  practiceStore.session.sessionStartTime = Date.now()

  tempDisplayStrategy.stats = {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  }

  const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)

  // 如果题目来自自适应引擎且预置了选项，使用 choice 模式
  const isAdaptiveChoice = currentQuestion.value.options && currentQuestion.value.options.length > 0
  if (isAdaptiveChoice) {
    session.value.displayMode = { layout: 'horizontal', input: 'options' }
    session.value.currentOptions = [...currentQuestion.value.options]
  } else {
    session.value.displayMode = mode

    if (mode.input === 'options') {
      generateOptions(currentQuestion.value.solution)
    }
  }

  // Start the first question timer
  practiceStore.startQuestionTimer()
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

/** 竖式逐位输入：委托给 DigitInput */
const digitFocusIdx = ref(-1)
const layoutRef = ref(null)
/** 防退格后 @input 重复处理 */
let bsLock = false

const handleInput = (value) => {
  if (session.value.displayMode.layout === 'vertical' && session.value.displayMode.input === 'keypad') {
    if (bsLock) { bsLock = false; return }   // 退格触发的 input，跳过
    const digit = value.replace(/_/g, '').slice(-1)
    if (digit && layoutRef.value?.acceptDigit) {
      session.value.currentAnswer = layoutRef.value.acceptDigit(digit)
    }
    return
  }
  session.value.currentAnswer = value
}

const handleBackspace = () => {
  if (session.value.displayMode.layout === 'vertical' && session.value.displayMode.input === 'keypad') {
    bsLock = true
    if (layoutRef.value?.acceptBackspace) {
      session.value.currentAnswer = layoutRef.value.acceptBackspace()
    }
    return
  }
  session.value.currentAnswer = session.value.currentAnswer.slice(0, -1)
}

const handleSelect = (option) => {
  session.value.selectedOption = option
  handleSubmit(option)
}

const handleSubmit = (answer) => {
  const rawAnswer = String(session.value.currentAnswer || '').replace(/_/g, '')
  const userAnswer = answer !== undefined ? answer : Number(rawAnswer)

  if (isNaN(userAnswer)) {
    ElMessage.warning('请输入答案')
    return
  }

  const isCorrect = userAnswer === currentQuestion.value.solution

  // ── Timing & metadata ──
  const responseTime = practiceStore.endQuestionTimer()

  // Extract metadata from the equation
  const parsed = parseEquation(currentQuestion.value.equation)
  const operator = parsed?.operator || ''
  const isCarry = getCarryType(parsed) === 'carry'
  const isBorrow = getCarryType(parsed) === 'borrow'
  const leftVal = parseInt(parsed?.leftOperand) || 0
  const rightVal = parseInt(parsed?.rightOperand) || 0
  const operandMin = Math.min(leftVal, rightVal)
  const operandMax = Math.max(leftVal, rightVal)
  // Determine stepCount — check the current configSnapshot or use heuristics
  const stepCount = currentQuestion.value.stepCount || 1

  // ── / metadata ──

  session.value.answers.push({
    ...currentQuestion.value,
    userAnswer,
    isCorrect,
    timestamp: Date.now(),
    responseTime,
    operator,
    isCarry,
    isBorrow,
    stepCount,
    operandMin,
    operandMax
  })

  if (isCorrect) {
    session.value.streak++
    session.value.feedbackType = 'correct'
    tempDisplayStrategy.updateStats(true)
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

    // 评估模式下连续错 2 次 → 提前结束评估，直接进入练习
    tempDisplayStrategy.updateStats(isCorrect)
    const shouldAbortAssessment = isAssessment.value && tempDisplayStrategy.stats.consecutiveWrong >= 2

    if (shouldAbortAssessment) {
      const nextFn = () => {
        session.value.feedbackType = null
        session.value.currentAnswer = ''
        digitFocusIdx.value = -1
        handleAssessmentComplete()
      }

      if (session.value.displayMode.input === 'keypad') {
        setTimeout(nextFn, 1500)
      } else {
        setTimeout(nextFn, 1500)
      }
    } else {
      setTimeout(() => {
        if (session.value.displayMode.input === 'keypad') {
          session.value.feedbackType = null
          session.value.currentAnswer = ''
          digitFocusIdx.value = -1
        }
      }, 1500)
    }
    return // skip the extra tempDisplayStrategy.updateStats call below
  }

  // (isCorrect path also falls through — already handled above)
}

const handleNext = () => {
  if (nextLocked) return
  nextLocked = true

  if (!isLastQuestion.value) {
    practiceStore.nextQuestion()
    practiceStore.resetQuestionInputState()
    practiceStore.startQuestionTimer()
    digitFocusIdx.value = -1  // 重置点击焦点

    if (!currentQuestion.value) {
      nextLocked = false
      return
    }

    const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)

    // 自适应引擎预置选项
    const isAdaptiveChoice = currentQuestion.value.options && currentQuestion.value.options.length > 0
    if (isAdaptiveChoice) {
      session.value.displayMode = { layout: 'horizontal', input: 'options' }
      session.value.currentOptions = [...currentQuestion.value.options]
    } else {
      session.value.displayMode = mode
      if (mode.input === 'options') {
        generateOptions(currentQuestion.value.solution)
      }
    }
    nextLocked = false
  } else {
    // ── Session complete — handle based on phase ──
    const fn = isAssessment.value ? handleAssessmentComplete :
               adaptiveEngine.value ? completeAdaptiveGroup : handlePracticeComplete
    // reset nextLocked after the handler runs
    const result = fn()
    // If fn is async, give it a tick to unlock
    if (result instanceof Promise) {
      result.finally(() => { nextLocked = false })
    } else {
      nextLocked = false
    }
  }
}

/** 生成一组题目（内建题型穿插） */
function generateBatch(engine, count) {
  const config = getDifficultyConfig(engine)
  const paperList = [{
    step: config.step,
    numberOfFormulas: count,
    whereIsResult: config.whereIsResult,
    formulaList: config.formulaList,
    resultMinValue: config.resultMinValue,
    resultMaxValue: config.resultMaxValue,
    customFormulaList: null
  }]
  const papers = createFormulasGenerator(config, paperList)
  const formulas = papers.reduce((p, c) => { p.push(...c.formulas); return p }, [])
  const baseQuestions = formulas.map(cur => ({
    equation: cur,
    solution: EquationSolver.solve(cur)
  })).filter(q => q.solution !== null && !isNaN(q.solution))

  // 题型多样化：混合不同的输入模式和填空位置
  return diversifyBatch(baseQuestions, engine)
}

/** 诊断完成 → 分析能力 → 启动自适应练习 */
const handleAssessmentComplete = async () => {
  const answers = session.value.answers
  const profile = analyzeAbility(answers)
  const answeredCount = answers.length

  ElMessage({
    message: `📊 评估完成！共 ${answeredCount} 题，正确 ${correctCount.value} 题`,
    duration: 3000,
    offset: 100,
    customClass: 'feedback-message'
  })

  // 创建自适应引擎，生成第 1 组
  // 从配置中读取练习量范围，未配置时使用默认值
  const snapshot = practiceStore.session.configSnapshot || {}
  const targetMin = snapshot.targetMin ?? 10
  const targetMax = snapshot.targetMax ?? 30
  const engine = createAdaptiveEngine(profile, targetMin, targetMax)
  adaptiveEngine.value = engine
  adaptiveGroupIndex.value = 1

  const size = getGroupSize(engine)
  const firstQuestions = generateBatch(engine, size)

  practiceStore.completeAssessment(profile)
  practiceStore.setListPractices(firstQuestions)
}

/** 自适应一组完成 → 评估 → 生成下一组或结束 */
const completeAdaptiveGroup = async () => {
  const allAnswers = [...session.value.answers]
  const engine = adaptiveEngine.value
  const size = getGroupSize(engine)
  const groupAnswers = allAnswers.slice(-size)
  const groupCorrect = groupAnswers.filter(a => a.isCorrect).length
  const groupTime = groupAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)

  // ── 小组反馈 ──
  const groupIdx = adaptiveGroupIndex.value
  const label = getDifficultyLabel(engine)
  const correctRate = Math.round((groupCorrect / groupAnswers.length) * 100)

  let groupComment = ''
  if (correctRate === 100 && groupTime < groupAnswers.length * 5000) {
    groupComment = '又快又准！👍'
  } else if (correctRate >= 80) {
    groupComment = '表现不错！💪'
  } else if (correctRate >= 60) {
    groupComment = '继续加油！📝'
  } else {
    groupComment = '别灰心，再来一组！'
  }

  ElMessage({
    message: `✅ 第${groupIdx}组结束！${groupCorrect}/${groupAnswers.length} 正确 · ${formatDuration(groupTime)} · ${groupComment}`,
    duration: 3000,
    offset: 100,
    customClass: 'feedback-message'
  })

  // 评估并决定下一步
  const result = evaluateGroup(engine, groupAnswers)
  adaptiveEngine.value = result.engine
  adaptiveGroupIndex.value++

  if (result.done) {
    // ── 全部完成 → 显示精美的结束画面 ──
    const finalAnswers = allAnswers
    const totalCorrect = finalAnswers.filter(a => a.isCorrect).length
    const totalTime = finalAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)
    const totalRate = Math.round((totalCorrect / finalAnswers.length) * 100)

    // 计算评语
    let comment = ''
    let emoji = ''
    if (totalRate >= 95) {
      emoji = '🏆'
      comment = '太棒了！你是数学小达人！'
    } else if (totalRate >= 80) {
      emoji = '🌟'
      comment = '做得很好！继续保持！'
    } else if (totalRate >= 60) {
      emoji = '💪'
      comment = '不错哦！每次练习都会进步！'
    } else {
      emoji = '🌱'
      comment = '没关系，多练几次就能掌握！'
    }

    try {
      await ElMessageBox.alert(
        `<div style="text-align:center;padding:8px 0;">
          <div style="font-size:48px;margin-bottom:12px;">${emoji}</div>
          <div style="font-size:20px;font-weight:700;color:#1e3c5c;margin-bottom:4px;">练习完成</div>
          <div style="font-size:14px;color:#606266;margin-bottom:12px;">${comment}</div>
          <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;font-size:14px;">
            <div><span style="color:#909399;">共答</span> <strong>${finalAnswers.length}</strong> 题</div>
            <div><span style="color:#909399;">正确</span> <strong style="color:#58cc71;">${totalCorrect}</strong> 题</div>
            <div><span style="color:#909399;">正确率</span> <strong style="color:${totalRate >= 80 ? '#58cc71' : '#e6a23c'};">${totalRate}%</strong></div>
            <div><span style="color:#909399;">用时</span> <strong>${formatDuration(totalTime)}</strong></div>
          </div>
        </div>`,
        '🎉 本轮练习汇总',
        {
          confirmButtonText: '开始新一轮',
          dangerouslyUseHTMLString: true,
          confirmButtonClass: 'el-button--primary',
          callback: () => {
            // 开始新一轮
            startNewAdaptiveSession(); nextLocked = false
          }
        }
      )
    } catch {
      // 用户点了关闭 → 退出到空闲状态
    }

    session.value.answers = finalAnswers
    adaptiveEngine.value = null
    adaptiveGroupIndex.value = 0
    practiceStore.saveSessionToDB()
    return
  }

  // 生成下一组
  const nextQuestions = generateBatch(result.engine, result.nextGroupSize)
  practiceStore.resetCurrentIndex()
  practiceStore.setListPractices(nextQuestions)
  session.value.answers = [...allAnswers]
}

/** 开始新一轮自适应练习（基于已有能力画像或重新评估） */
const startNewAdaptiveSession = () => {
  const profile = practiceStore.abilityProfile
  if (!profile) {
    // 没有画像 → 重新评估
    practiceStore.setPhase('idle')
    practiceStore.setListPractices([])
    const questions = generateDiagnosticQuestions()
    if (questions.length > 0) {
      practiceStore.startAssessment(questions)
    }
    return
  }

  // 基于已有画像生成新一轮练习
  const snapshot = practiceStore.session.configSnapshot || {}
  const targetMin = snapshot.targetMin ?? 10
  const targetMax = snapshot.targetMax ?? 30
  const engine = createAdaptiveEngine(profile, targetMin, targetMax)
  adaptiveEngine.value = engine
  adaptiveGroupIndex.value = 1

  practiceStore.resetPracticeSession()
  practiceStore.session.sessionStartTime = Date.now()
  practiceStore.setPhase('practice')

  const size = getGroupSize(engine)
  const questions = generateBatch(engine, size)
  practiceStore.setListPractices(questions)

  ElMessage({
    message: '🔄 新一轮开始！加油！',
    duration: 2000,
    offset: 100,
    customClass: 'feedback-message'
  })
}

/** 正常练习完成 → 保存到 DB */
const handlePracticeComplete = async () => {
  await practiceStore.saveSessionToDB()

  ElMessage({
    message: `🎉 完成！共 ${totalQuestions.value} 题，正确 ${correctCount.value} 题 (${Math.round((correctCount.value / totalQuestions.value) * 100)}%)`,
    duration: 4000,
    offset: 100,
    customClass: 'feedback-message'
  })

  setTimeout(() => {
    ElMessage({
      message: '点击查看练习统计',
      duration: 6000,
      offset: 150,
      icon: '🧮',
      customClass: 'feedback-message',
      onClose: () => {}
    })
  }, 1500)

  console.log('练习完成', {
    total: totalQuestions.value,
    correct: correctCount.value
  })
}

watch(currentQuestion, (newQ) => {
  console.log('当前题目:', newQ)
})

watch(listPractices, (newPracticeList) => {
  if (newPracticeList.length > 0) {
    const isAdaptiveTransition = adaptiveEngine.value && adaptiveGroupIndex.value > 1
    const saved = isAdaptiveTransition ? [...session.value.answers] : []
    practiceStore.resetCurrentIndex()
    digitFocusIdx.value = -1  // 新题重置焦点
    initPractice()
    if (isAdaptiveTransition) {
      session.value.answers = saved
    }
  }
})

/** 首次进入自动触发能力诊断 */
onMounted(() => {
  // 情况 1: 首次进入 → 自动诊断
  if (isIdle.value && listPractices.value.length === 0) {
    const questions = generateDiagnosticQuestions()
    if (questions.length > 0) {
      practiceStore.startAssessment(questions)
    }
    return
  }

  // 情况 2: 已有能力画像但题目已清空（刷新后）→ 恢复练习
  if (isPractice.value && abilityProfile.value && listPractices.value.length === 0) {
    startNewAdaptiveSession()
  }
})
</script>

<style scoped>
.practice-view {
  width: 100%;
  min-height: 100%;
}

.practice-shell {
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.practice-card {
  width: min(100%, 980px);
  --interaction-width: min(100%, 760px);
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

.stage-badge--assessment {
  color: #7c3aed;
  background: #f3e8ff;
  border-color: #c084fc;
}

/* ── Loading state ── */
.practice-card--loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.loading-state {
  text-align: center;
  color: #909399;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  margin: 0 auto 16px;
  border: 3px solid #e8edf3;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  font-size: 15px;
  margin: 0;
}

.streak-badge {
  color: #d97706;
  background: #fff7ed;
}

.question-area {
  margin-top: 8px;
  display: flex;
  justify-content: center;
}

.input-area {
  margin-top: 14px;
  display: flex;
  justify-content: center;
}

.question-area :deep(.math-question-surface),
.question-area :deep(.vertical-layout.math-question-surface),
.input-area :deep(.keypad-shell) {
  width: var(--interaction-width);
  max-width: var(--interaction-width);
  margin-left: auto;
  margin-right: auto;
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

  .question-area {
    --interaction-width: min(100%, 620px);
  }

  .practice-card {
    --interaction-width: min(100%, 620px);
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

  .question-area {
    --interaction-width: min(100%, 520px);
  }

  .practice-card {
    --interaction-width: min(100%, 520px);
  }
}

/* ── Floating stats button ── */
.stats-fab {
  position: fixed !important;
  bottom: 32px;
  left: 24px;
  z-index: 100;
  width: 44px !important;
  height: 44px !important;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stats-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(64, 158, 255, 0.45);
}

@media (max-width: 768px) {
  .stats-fab {
    bottom: 20px;
    left: 16px;
    width: 48px !important;
    height: 48px !important;
  }
}

/* ── Short viewport height tweaks ── */
@media (max-height: 800px) {
  .practice-card {
    border-radius: 16px;
  }
  :deep(.el-card__body) {
    padding: 12px 16px;
  }
}

@media (max-height: 600px) {
  :deep(.el-card__body) {
    padding: 8px 12px;
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