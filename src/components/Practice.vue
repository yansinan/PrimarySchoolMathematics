<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <!-- P2: 用户能力画像卡片（仅在有答题数据时显示） -->
      <AbilityCard v-if="overallStats.total > 0" />

      <el-card class="practice-card" shadow="never" v-if="currentQuestion !== null">
        <div class="practice-card__header">
          <div class="stage-badge" :class="{ 'stage-badge--assessment': isAssessment }">{{ currentStage }}</div>
          <div class="streak-badge" v-if="session.streak > 0">🔥 {{ session.streak }}</div>
        </div>

        <ProgressSteps
          :total="totalQuestions"
          :current="currentIndex + 1"
          :answers="session.answers.slice(groupAnswerOffset)"
          :correct-count="groupCorrectCount"
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

  <!-- ── 练习汇总弹窗（替代内联 HTML + ElMessageBox） ── -->
  <PracticeSummaryDialog
    v-model:visible="dialogs.summaryVisible.value"
    v-bind="dialogs.summaryProps.value"
    @select="dialogs.onSummarySelect"
  />

  <!-- ── 自我评价弹窗（替代 window.__evalSelect 桥） ── -->
  <SelfEvaluationDialog
    v-model:visible="dialogs.evalVisible.value"
    v-bind="dialogs.evalProps.value"
    @select="dialogs.onEvalSelect"
  />
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { TrendCharts } from '@element-plus/icons-vue'

import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import PracticeSummaryDialog from '@/components/PracticeSummaryDialog.vue'
import SelfEvaluationDialog from '@/components/SelfEvaluationDialog.vue'
import AbilityCard from '@/components/profile/AbilityCard.vue'
import { getCarryType, parseEquation } from '@/utils/equationParser'
import { generateDiagnosticQuestions, analyzeAbility, generatePracticeConfig } from '@/utils/diagnostic'
import { createAdaptiveEngine, getGroupSize, evaluateGroup, getDifficultyLabel } from '@/utils/adaptiveEngine'
import { formatDuration } from '@/utils/timeFormat'
import { generateAdaptiveBatch } from '@/utils/adaptiveBatch'
import { decideDisplayMode, updateDisplayStats, createInitialStats } from '@/utils/displayStrategy'
import { useAdaptiveSession } from '@/composables/useAdaptiveSession'
import { usePracticeDialogs } from '@/composables/usePracticeDialogs'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { useAbilityProfile } from '@/composables/useAbilityProfile'
import { FEEDBACK_DELAYS, ASSESSMENT_ABORT_WRONG_STREAK, getGroupComment, getCommentByRate } from '@/constants/practice'

import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { storeToRefs } from 'pinia'

// ── 汇总弹窗 HTML 已抽到 utils/practiceSummary.js ──

const practiceStore = usePracticeStore()
const statsStore = useStatsStore()
const router = useRouter()
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

// ── 题目展示策略状态（抽到 utils/displayStrategy.js，纯函数化） ──
// 注意：原实现是模块级 mutable，改为 ref 化的响应式状态
const displayStats = ref(createInitialStats())

// ── 自适应会话 composable ──
// 响应式状态：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset / nextLocked
// 方法：startNewAdaptiveSession
// 注：handleAssessmentComplete / completeGroup 仍由本文件内 const 声明实现
const {
  adaptiveEngine,
  adaptiveGroupIndex,
  groupAnswerOffset,
  groupCorrectCount,
  nextLocked,
  startNewAdaptiveSession,
} = useAdaptiveSession()

// ── 弹窗 composable（替代 ElMessageBox 和 window.__evalSelect 桥） ──
const dialogs = usePracticeDialogs()

// ── 持久化 composable（封装 4 处 saveSessionToDB 调用） ──
const saver = usePracticeSaver()

// ── 用户能力画像 composable（P2: UI 展示） ──
const { overallStats } = useAbilityProfile()

/** 自适应引擎状态（注：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset
 *  / groupCorrectCount / nextLocked 等已抽到 useAdaptiveSession） */

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

  // 只重置题目相关的输入/反馈状态，保留 session.answers 累计
  // （之前 resetPracticeSession 会清空 answers，导致诊断答案丢失，
  //   完成弹窗的"整轮"统计不准确）
  practiceStore.resetQuestionInputState()
  practiceStore.session.sessionStartTime = Date.now()

  displayStats.value = createInitialStats()

  const mode = decideDisplayMode(currentQuestion.value.equation, displayStats.value)

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
  // 横式 + keypad：也委托给 DigitInput 管理逐位输入
  if (session.value.displayMode.layout === 'horizontal' && session.value.displayMode.input === 'keypad') {
    if (bsLock) { bsLock = false; return }
    const digit = String(value || '').replace(/_/g, '').slice(-1)
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
  // 横式 + keypad：同样委托给 DigitInput
  if (session.value.displayMode.layout === 'horizontal' && session.value.displayMode.input === 'keypad') {
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

  // 按题号去重：如果已答过该题（重试），替换旧记录而非追加
  // 注意：questionIndex = groupAnswerOffset + currentIndex（跨组全局唯一）
  // 必须用 answerEntry.questionIndex 比较，不能用 currentIndex.value
  // （后者只反映当前组内的题号，会跨组冲突导致后续题号累加失效）
  const newQuestionIndex = groupAnswerOffset.value + currentIndex.value
  const existingIdx = session.value.answers.findIndex(a => a.questionIndex === newQuestionIndex)
  const answerEntry = {
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
    operandMax,
    questionIndex: newQuestionIndex
  }
  if (existingIdx >= 0) {
    session.value.answers[existingIdx] = answerEntry
  } else {
    session.value.answers.push(answerEntry)
  }

  // ── 每道题立即写入数据库（fire-and-forget）──
  // answerEntry 已在 session 中按 questionIndex 去重，
  // 多次写入同一题会自动覆盖，统计时以最新为准
  saver.savePerQuestion()

  if (isCorrect) {
    session.value.streak++
    session.value.feedbackType = 'correct'
    displayStats.value = updateDisplayStats(displayStats.value, true)
    ElMessage.success({
      message: '✓ 正确！',
      duration: FEEDBACK_DELAYS.correct,
      offset: 100,
      customClass: 'feedback-message'
    })

    setTimeout(() => {
      handleNext()
    }, FEEDBACK_DELAYS.correct)
  } else {
    session.value.streak = 0
    session.value.feedbackType = 'wrong'
    ElMessage.error({
      message: `✗ 正确答案是 ${currentQuestion.value.solution}`,
      duration: FEEDBACK_DELAYS.wrong,
      offset: 100,
      customClass: 'feedback-message'
    })

    // 评估模式下连续错 N 次 → 提前结束评估
    displayStats.value = updateDisplayStats(displayStats.value, isCorrect)
    const shouldAbortAssessment = isAssessment.value && displayStats.value.consecutiveWrong >= ASSESSMENT_ABORT_WRONG_STREAK

    if (shouldAbortAssessment) {
      const nextFn = () => {
        session.value.feedbackType = null
        session.value.currentAnswer = ''
        digitFocusIdx.value = -1
        handleAssessmentComplete()
      }

      if (session.value.displayMode.input === 'keypad') {
        setTimeout(nextFn, FEEDBACK_DELAYS.assessmentAbort)
      } else {
        setTimeout(nextFn, FEEDBACK_DELAYS.assessmentAbort)
      }
    } else {
      setTimeout(() => {
        if (session.value.displayMode.input === 'keypad') {
          session.value.feedbackType = null
          session.value.currentAnswer = ''
          digitFocusIdx.value = -1
        }
      }, FEEDBACK_DELAYS.wrong)
    }
    return // skip the extra displayStats update call below
  }

  // (isCorrect path also falls through — already handled above)
}

const handleNext = () => {
  if (nextLocked.value) return
  nextLocked.value = true

  if (!isLastQuestion.value) {
    practiceStore.nextQuestion()
    practiceStore.resetQuestionInputState()
    practiceStore.startQuestionTimer()
    digitFocusIdx.value = -1  // 重置点击焦点

    if (!currentQuestion.value) {
      nextLocked.value = false
      return
    }

    const mode = decideDisplayMode(currentQuestion.value.equation, displayStats.value)

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
    nextLocked.value = false
  } else {
    // ── Session complete — handle based on phase ──
    const fn = isAssessment.value ? handleAssessmentComplete :
               adaptiveEngine.value ? completeAdaptiveGroup : handlePracticeComplete
    // reset nextLocked after the handler runs
    const result = fn()
    // If fn is async, give it a tick to unlock
    if (result instanceof Promise) {
      result.finally(() => { nextLocked.value = false })
    } else {
      nextLocked.value = false
    }
  }
}

/** 生成一组题目已抽到 utils/adaptiveBatch.js 的 generateAdaptiveBatch */

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
  const firstQuestions = generateAdaptiveBatch(engine, size)

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

  // 小组评语（抽到 constants/practice.getGroupComment）
  const groupComment = getGroupComment(correctRate, groupTime, groupAnswers.length)

  // ── 强化小组反馈：弹出自我评价对话框（改用 Vue 组件 + composable） ──
  // 移除了原来的 window.__evalSelect 全局桥和内联 HTML 拼接
  let evaluationScore = 3  // 默认 3 = 刚刚好
  try {
    evaluationScore = await dialogs.showSelfEvaluationDialog({
      groupIndex: groupIdx,
      correctCount: groupCorrect,
      totalCount: groupAnswers.length,
      timeText: formatDuration(groupTime),
      comment: groupComment,
    })
  } catch { /* 弹窗关闭异常 → 保持默认 3 */ }

  adaptiveEngine.value.lastEvaluation = evaluationScore

  // 评估并决定下一步
  const result = evaluateGroup(engine, groupAnswers)
  adaptiveEngine.value = result.engine
  adaptiveGroupIndex.value++

  // ── 实时保存检查点 ──
  // 每组完成后立即保存到数据库，防止中途数据丢失
  session.value.answers = allAnswers
  saver.saveGroupCheckpoint(result.engine.history)

  if (result.done) {
    // ── 全部完成 → 显示精美的结束画面 ──
    const finalAnswers = allAnswers
    const totalCorrect = finalAnswers.filter(a => a.isCorrect).length
    const totalTime = finalAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)
    const totalRate = Math.round((totalCorrect / finalAnswers.length) * 100)

    // 计算评语（抽到 constants/practice.getCommentByRate）
    const { emoji, comment, color: rateColor2 } = getCommentByRate(totalRate)

    // 全部完成 → 弹出练习汇总弹窗（改用 Vue 组件 + composable）
    let action = 'close'
    try {
      action = await dialogs.showPracticeSummaryDialog({
        emoji,
        comment,
        totalAnswers: finalAnswers.length,
        correctAnswers: totalCorrect,
        rate: totalRate,
        rateColor: rateColor2,
        totalTime: formatDuration(totalTime),
        confirmText: '开始新一轮',
        cancelText: '📊 分析',
      })
    } catch { /* 弹窗异常 → action 保持 'close' */ }

    // 无论 action 是什么，都先保存到数据库
    await saver.saveAdaptiveFinal(finalAnswers, (result.engine && result.engine.history) || [])
    practiceStore.setListPractices([])
    if (action === 'confirm') {
      startNewAdaptiveSession()
    } else {
      // 'cancel' 或 'close' 都视为查看分析或返回首页
      adaptiveEngine.value = null
      adaptiveGroupIndex.value = 0
      groupAnswerOffset.value = 0
      router.push('/home')
      if (action === 'cancel') {
        setTimeout(() => statsStore.openDrawer(), 300)
      }
    }
    nextLocked.value = false
    return
  }

  // 生成下一组
  const nextQuestions = generateAdaptiveBatch(result.engine, result.nextGroupSize)
  groupAnswerOffset.value = allAnswers.length
  practiceStore.resetCurrentIndex()
  practiceStore.setListPractices(nextQuestions)
  session.value.answers = [...allAnswers]
}

/** 开始新一轮自适应练习（已抽到 composables/useAdaptiveSession.js） */

/** 正常练习完成 → 保存到 DB，弹出汇总弹窗，关闭后跳首页 */
const handlePracticeComplete = async () => {
  const totalAns = totalQuestions.value
  const correctAns = correctCount.value
  const rate = Math.round((correctAns / totalAns) * 100)

  // 保存到 DB
  await saver.savePracticeFinal()

  // 评语（抽到 constants/practice.getCommentByRate）
  const { emoji, comment, color: rateColor } = getCommentByRate(rate)
  let action = 'close'
  try {
    action = await dialogs.showPracticeSummaryDialog({
      emoji,
      comment,
      totalAnswers: totalAns,
      correctAnswers: correctAns,
      rate,
      rateColor,
      confirmText: '📊 分析',
      cancelText: '🏠 首页',
    })
  } catch { /* 弹窗异常 → action 保持 'close' */ }

  // 关闭弹窗后清空题目，watch 会根据 phase/abilityProfile 自动恢复或跳走
  // （注意：不清空会导致 lastQuestion 重复显示"已完成"状态，所以清空）
  practiceStore.setListPractices([])
  router.push('/home')
  if (action === 'confirm') {
    setTimeout(() => statsStore.openDrawer(), 300)
  }
}

watch(listPractices, (newPracticeList) => {
  if (newPracticeList.length > 0) {
    const isAdaptiveTransition = adaptiveEngine.value && adaptiveGroupIndex.value > 1
    // 保存当前 answers 用于组间切换时恢复（避免 initPractice 的 reset 清空）
    const saved = isAdaptiveTransition ? [...session.value.answers] : []
    // 关键：groupAnswerOffset 必须指向本组开始位置
    // - 组间切换（adaptive 第 2+ 组）：保留之前组的所有答案，offset = saved 长度
    // - 第一组（从诊断/普通练习切到自适应）：offset = 当前 answers 长度（含诊断 5 道）
    groupAnswerOffset.value = saved.length
    practiceStore.resetCurrentIndex()
    digitFocusIdx.value = -1  // 新题重置焦点
    initPractice()
    if (isAdaptiveTransition) {
      session.value.answers = saved
    }
    return
  }

  // 防御性修复：listPractices 变空时（用户完成全部练习关闭弹窗后）
  // 卡 loading 的两个常见场景：
  //  1) 自适应完成（completeAdaptiveGroup）→ 弹窗关闭 → setListPractices([])
  //     abilityProfile 存在 → 启动新一轮自适应
  //  2) 普通练习完成（handlePracticeComplete）→ 弹窗关闭 → setListPractices([])
  //     abilityProfile=null，但 phase=practice（Generate.vue 调用 setAbilityProfile(null)）
  //     没有 profile 也不能用 startNewAdaptiveSession → 重新进入 idle + 触发诊断
  // 这样无论用户从哪种模式完成练习，都不会卡在 loading 状态
  if (abilityProfile.value && !adaptiveEngine.value) {
    startNewAdaptiveSession()
  } else if (phase.value === 'practice' && !abilityProfile.value) {
    // 普通练习模式完成：重新进入诊断模式
    practiceStore.setPhase('idle')
    const questions = generateDiagnosticQuestions()
    if (questions.length > 0) {
      practiceStore.startAssessment(questions)
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

/* ── 自我评价对话框 ── */
.eval-dialog {
  width: min(400px, calc(100vw - 48px)) !important;
  border-radius: 20px !important;
  padding: 4px 0 !important;
  box-shadow: 0 20px 60px rgba(23, 110, 191, 0.12) !important;
}

.eval-dialog .el-message-box__header {
  padding: 18px 20px 0 !important;
}

.eval-dialog .el-message-box__title {
  font-size: 18px !important;
  font-weight: 600 !important;
  color: #1e3c5c !important;
}

.eval-dialog .el-message-box__content {
  padding: 16px 20px 24px !important;
}

.eval-dialog .el-message-box__close {
  font-size: 18px !important;
  color: #c0ccda !important;
}

.eval-dialog .el-message-box__close:hover {
  color: #909399 !important;
}

/* ── 完成弹窗的"关闭"按钮 ── */
.finish-close-btn {
  background: #f0f2f5 !important;
  border-color: #dcdfe6 !important;
  color: #606266 !important;
  border-radius: 20px !important;
  padding: 8px 20px !important;
  font-size: 14px !important;
}

.finish-close-btn:hover {
  background: #e4e7ed !important;
  color: #303133 !important;
}

.eval-dialog .el-button--primary {
  border-radius: 20px !important;
  padding: 8px 20px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}
</style>