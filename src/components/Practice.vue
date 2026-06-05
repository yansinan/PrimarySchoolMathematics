<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <!-- P2: 用户能力画像仅在汇总弹窗中显示完整版（PracticeSummaryDialog），
           答题时不再常驻以避免分散注意力 -->

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
import PracticeSummaryDialog from '@/components/dialog/PracticeSummaryDialog.vue'
import SelfEvaluationDialog from '@/components/dialog/SelfEvaluationDialog.vue'
import { extractQuestionMetadata } from '@/utils/equationParser'
import { generateDiagnosticQuestions, analyzeAbility, generatePracticeConfig } from '@/utils/diagnostic'
import { createAdaptiveEngine, getGroupSize, evaluateGroup, getDifficultyLabel } from '@/utils/adaptiveEngine'
import { formatDuration } from '@/utils/timeFormat'
import { generateAdaptiveBatch } from '@/utils/adaptiveBatch'
import { decideDisplayMode, updateDisplayStats } from '@/utils/displayStrategy'  // decideDisplayMode / updateDisplayStats 仍在 V 层 (handleSubmit 用)
import { useAdaptiveSession } from '@/composables/useAdaptiveSession'
import { usePracticeDialogs } from '@/composables/usePracticeDialogs'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { useDisplayStrategy } from '@/composables/useDisplayStrategy'  // 🆕 PR-4.2 抽离 displayStats + applyDisplayModeForCurrentQuestion + generateOptions
import { buildAttemptScore, sumAnswerScores } from '@/utils/score'
import { FEEDBACK_DELAYS, ASSESSMENT_ABORT_WRONG_STREAK, getGroupComment, getCommentByRate, ASSIST_LEVELS } from '@/constants/practice'
import { TARGET_LIMITS } from '@/utils/formDefaults'

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

// ── 题目展示策略 composable (PR-4.2 抽离) ──
// 封装 displayStats ref + applyDisplayModeForCurrentQuestion + generateOptions + resetDisplayStats
const {
  displayStats,
  applyDisplayModeForCurrentQuestion,
  generateOptions,
  resetDisplayStats,
} = useDisplayStrategy(session, currentQuestion)

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

/**
 * 每题重置：重置输入/反馈状态 + 计时器 + displayMode
 * 注意：不清空 session.answers（只在组边界才清空，见 resetGroupAnswers）
 * 这样 handleNext 每题调此处时，当前组答案不丢失，
 * completeAdaptiveGroup 中 allAnswers = [...session.answers] 能拿到完整组数据。
 */
const initPractice = () => {
  if (!currentQuestion.value) return

  // 重置输入/反馈状态（feedbackType→null、currentAnswer→''、selectedOption→null）
  practiceStore.resetQuestionInputState()
  practiceStore.session.sessionStartTime = Date.now()

  // 重置 displayStats (PR-4.2 抽到 composable)
  resetDisplayStats()

  // 从 currentQuestion.inputMode 查 ASSIST_LEVELS 表决定 layout/input
  applyDisplayModeForCurrentQuestion()

  // Start the first question timer
  practiceStore.startQuestionTimer()
}

/**
 * 组边界重置：清空当前组 session.answers（之前组答题不应留在本组）
 * 整轮所有组的累计存到 adaptiveAnswers（弹窗用）
 * 只在新组开始时调用，不在每题切换时调。
 */
const resetGroupAnswers = () => {
  practiceStore.session.answers = []
}

/** 竖式逐位输入：委托给 DigitInput */
const digitFocusIdx = ref(-1)
const layoutRef = ref(null)
/** 防退格后 @input 重复处理 */
let bsLock = false

/** 是否启用 DigitInput 逐位输入（keypad 模式统一处理，不区分横/竖式） */
const isKeypad = () => session.value.displayMode.input === 'keypad'

const handleInput = (value) => {
  if (!isKeypad()) {
    session.value.currentAnswer = value
    return
  }
  if (bsLock) { bsLock = false; return }   // 退格触发的 input，跳过
  const digit = String(value || '').replace(/_/g, '').slice(-1)
  if (digit && layoutRef.value?.acceptDigit) {
    session.value.currentAnswer = layoutRef.value.acceptDigit(digit)
  }
}

const handleBackspace = () => {
  if (!isKeypad()) {
    session.value.currentAnswer = session.value.currentAnswer.slice(0, -1)
    return
  }
  bsLock = true
  if (layoutRef.value?.acceptBackspace) {
    session.value.currentAnswer = layoutRef.value.acceptBackspace()
  }
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
  const { operator, isCarry, isBorrow, stepCount, operandMin, operandMax } = extractQuestionMetadata(
    currentQuestion.value.equation,
    currentQuestion.value
  )

  // ── / metadata ──

  // 按题号去重：如果已答过该题（重试），替换旧记录而非追加
  // 注意：questionIndex = groupAnswerOffset + currentIndex（跨组全局唯一）
  // 必须用 answerEntry.questionIndex 比较，不能用 currentIndex.value
  // （后者只反映当前组内的题号，会跨组冲突导致后续题号累加失效）
  const newQuestionIndex = groupAnswerOffset.value + currentIndex.value
  const existingIdx = session.value.answers.findIndex(a => a.questionIndex === newQuestionIndex)
  const previousAttemptCount = existingIdx >= 0 ? (session.value.answers[existingIdx].attemptCount || 1) : 0
  const { attemptCount, score } = buildAttemptScore(previousAttemptCount, isCorrect)
  const answerEntry = {
    ...currentQuestion.value,
    userAnswer,
    isCorrect,
    attemptCount,
    score,
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
    // 关键修复：调 initPractice（之前仅在 watch 路径调，handleNext 直接跳题时漏调）
    //  initPractice 重置 session.answers（每组只含本组）、currentIndex=0、displayStats
    initPractice()
    if (!currentQuestion.value) {
      nextLocked.value = false
      return
    }
    digitFocusIdx.value = -1  // 重置点击焦点
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
  // 使用固定默认值（targetMin=10, targetMax=30），
  // 不读 configSnapshot（属于 Generate.vue，已被多次污染）。
  // completeAssessment 会把这些默认值写入 adaptiveConfig，后续组从那读。
  const targetMin = 10
  const targetMax = 30
  const engine = createAdaptiveEngine(profile, targetMin, targetMax)
  adaptiveEngine.value = engine
  adaptiveGroupIndex.value = 1

  const size = getGroupSize(engine)
  const firstQuestions = generateAdaptiveBatch(engine, size)

  // 传入 targetMin/targetMax 到 adaptiveConfig（之后 startNewAdaptiveSession 从这读）
  practiceStore.completeAssessment(profile, { targetMin, targetMax })
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
  // 同步到 store（供 PracticeSummaryDialog 内嵌的 AbilityCard 读取）
  practiceStore.setCurrentDifficulty(result.engine.difficultyIdx, adaptiveGroupIndex.value)

  // ── 实时保存检查点 ──
  // 每组完成后立即保存到数据库，防止中途数据丢失
  // 关键修复：session.answers 维持"本组"边界（不累加多组）
  // 整轮所有组的累计存到 adaptiveAnswers
  practiceStore.adaptiveAnswers = [...practiceStore.adaptiveAnswers, ...allAnswers]
  saver.saveGroupCheckpoint(result.engine.history)

  // ── 强制兜底：累积答题超过硬上限 → 直接结束（不管引擎当前结果如何）──
  // 修复"configSnapshot 污染导致 targetMax 过大、练习永远不结束"的 bug
  const forceDone = practiceStore.adaptiveAnswers.length >= TARGET_LIMITS.absoluteMax

  if (result.done || forceDone) {
    // ── 全部完成 → 显示精美的结束画面 ──
    // finalAnswers 现在用 adaptiveAnswers（整轮所有组），不是 allAnswers（最后一组）
    const finalAnswers = practiceStore.adaptiveAnswers
    const totalCorrect = sumAnswerScores(finalAnswers)
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
      // 注意：setListPractices([]) 已在上面执行，watch 触发时 adaptiveEngine 还非 null，
      // 所以 watch 不会执行 startNewAdaptiveSession。需要在此处显式处理。
      const shouldRestart = abilityProfile.value && action !== 'cancel'
      adaptiveEngine.value = null
      adaptiveGroupIndex.value = 0
      groupAnswerOffset.value = 0
      if (shouldRestart) {
        startNewAdaptiveSession()
      }
      router.push('/home')
      if (action === 'cancel') {
        setTimeout(() => statsStore.openDrawer(), 300)
      }
    }
    nextLocked.value = false
    return
  }

  // 生成下一组
  // 先把本轮答案写回 session.answers（确保组边界数据完整），
  // 再 setListPractices 触发 watch（watch 内 saved = [...session.answers] 拿到完整数据）。
  // 之前顺序反了（先 setListPractices 再 session.answers = [...allAnswers]），
  // 导致 watch 捕获到未写完的数据，组边界数据分裂。
  const nextQuestions = generateAdaptiveBatch(result.engine, result.nextGroupSize)
  groupAnswerOffset.value = allAnswers.length
  session.value.answers = [...allAnswers]
  practiceStore.resetCurrentIndex()
  practiceStore.setListPractices(nextQuestions)
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
    // 每组开始时清空上一组答案（之前组答题已通过 adaptiveAnswers 累积）
    resetGroupAnswers()
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